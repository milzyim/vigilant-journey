import React, { useEffect,useRef, useState } from 'react';
import axios from 'axios';
import PropTypes from 'prop-types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'polyline-encoded';

const Map = ({ token }) => {
  const mapRef = useRef(null); // Use ref to persist the map instance
  const taxiRoutes = useRef([]);
  const [routeFetched, setRouteFetched] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const taxiMarkers = useRef([]); // To store the taxi markers
  const taxiDataRef = useRef([]);

  // State to store household locations (dummy data for now)
  const [households, setHouseholds] = useState([]);
  const [householdsReady, setHouseholdsReady] = useState(false);
  const [taxis, setTaxis] = useState([]);

  const taxiIcon = L.divIcon({
    className: 'custom-taxi-icon',
    html: '🚖', // Use the taxi emoji here
    iconSize: [30, 30], // Adjust size as needed
  });

  const fetchTaxiData = async () => {
    try {
      const response = await axios.get('http://localhost:2150/robo-taxi-status', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      const data = response.data;//await response.json();
  
      // Compare current data with previous to avoid unnecessary re-renders
      if (JSON.stringify(data) !== JSON.stringify(taxiDataRef.current)) {
        taxiDataRef.current = data; // Update the taxi data
        updateTaxiMarkers(data); // Call marker update function
      }
    } catch (error) {
      console.error("Error fetching taxi data:", error);
    }
  };

  // Update markers without re-rendering the component
  const updateTaxiMarkers = (taxis) => {
    if (mapRef.current) {
      taxis.forEach((taxi, index) => {
        if (!taxiMarkers.current[index]) {
          const marker = L.marker([taxi.lat, taxi.lng], { icon: taxiIcon });
          marker.addTo(mapRef.current).bindPopup(`Taxi ${taxi.id} - Capacity: ${taxi.capacity} <br> 
            Origin: ${taxi.currentAtHousehold} - Destination: ${taxi.finalDestination.household}<br>
            Battery: ${Math.floor(taxi.batteryLevel/taxi.batteryCapacity*100)}%`);
            
          taxiMarkers.current[index] = marker;
          
        } else {
          // Only update position
          //taxiMarkers.current[index].setLatLng([taxi.lat, taxi.lng]);
          const newLatLng = L.latLng(taxi.lat, taxi.lng);
          animateMarker(taxiMarkers.current[index], newLatLng, 1000 );
          taxiMarkers.current[index].bindPopup(`Taxi ${taxi.id} - Capacity: ${taxi.capacity} <br> 
            Origin: ${taxi.currentAtHousehold} - Destination: ${taxi.finalDestination.household}<br>
            Battery: ${Math.floor(taxi.batteryLevel/taxi.batteryCapacity*100)}%`);
        }
        //
        if (taxiRoutes.current[index]) {
            mapRef.current.removeLayer(taxiRoutes.current[index]); // Remove old route
        }

        const coords = taxi.route; // Array of [lat, lng]
        const polyline = L.polyline(coords, { color: taxi.routeColour });


        polyline.addTo(mapRef.current);
        taxiRoutes.current[index] = polyline; // Store new route
      });
    }
  };

  function animateMarker(marker, newLatLng, duration) {
    const startLatLng = marker.getLatLng();
    const startTime = performance.now();

    function animate() {
        const currentTime = performance.now();
        const elapsedTime = currentTime - startTime;
        const t = Math.min(elapsedTime / duration, 1);

        const currentLatLng = L.latLng(
            startLatLng.lat + t * (newLatLng.lat - startLatLng.lat),
            startLatLng.lng + t * (newLatLng.lng - startLatLng.lng)
        );

        marker.setLatLng(currentLatLng);

        if (t < 1) {
            requestAnimationFrame(animate);
        }
    }

    requestAnimationFrame(animate);
}

  useEffect(() => { // constant call
    const intervalId = setInterval(fetchTaxiData, 1000); // Poll every 1 second
    
    // Cleanup on component unmount
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    // You can fetch household data from the backend here if needed
    // For example:
    // fetch('/api/households')
    //   .then(response => response.json())
    //   .then(data => setHouseholds(data));
    // Initialize the map, centered on your desired location between Edinburgh and Glasgow
    let map;
    //get hosueholddata

    const mapContainer = document.getElementById('map');
    if (!mapContainer) return; // Ensure the map container exists

    const fetchHouseholds = async () => {
        if(!householdsReady){
            try {
                const houseHoldsResponse = await axios.get('http://localhost:2150/households', {
                  headers: {
                    Authorization: `Bearer ${token}`
                  }
                });
                
                //await fetch("http://localhost:2150/households");
                const householdjson = houseHoldsResponse.data;//await houseHoldsResponse.json();
                setHouseholds(householdjson);
                setHouseholdsReady(true);
    
            } catch (error) {
                console.error("Error fetching route:", error);
            }
        }else{
            return;
        }

    };

    const initializeMap = () => {
        if(!householdsReady) return;

        const map = L.map('map', {
            center: [55.9533, -3.1883], // Example coordinates between Edinburgh and Glasgow
            zoom: 12,
        });
        
        L.tileLayer('https://api.maptiler.com/maps/aquarelle/{z}/{x}/{y}.png?key=sAnvCQim0zFfapJ8I1pb').addTo(map);
        // Create the custom marker for the households
        const customHouseHoldIcon = new L.DivIcon({
            className: 'leaflet-emoji-icon',
            html: `<span style="font-size: 24px;">🏡</span>`, // Adjust the size as needed
            iconSize: [48, 48], // Overall icon size
            iconAnchor: [3, 20], // Adjust anchor position
        });

        // Add all the households as markers on the map
        households.forEach((household) => {
            L.marker([household.lat, household.lng], { icon: customHouseHoldIcon })
                .addTo(map)
                .bindPopup(`<b>${household.name}</b><br>Location: ${household.lat}, ${household.lng}`);
            });

        mapRef.current = map;
        setMapReady(true); // Set map as ready once it's initialized
    };

    const fetchRoute = async () => {

        if (!mapReady || !householdsReady) return;

        //calculate route
        const storedRoute = localStorage.getItem("cachedRoute");
        if (storedRoute && mapRef.current) {
            //setRoute(JSON.parse(storedRoute));
            const coords = L.Polyline.fromEncoded(JSON.parse(storedRoute)).getLatLngs(); // Decode polyline into coordinates
            //L.polyline(JSON.parse(storedRoute), { color: "rgb(153, 204, 255)" }).addTo(mapRef.current);
            L.polyline(coords, { color: "rgb(153, 204, 255)" }).addTo(mapRef.current);
            //console.log(coords);
            return; // Skip API call if cached route exists
        }

        console.log(households.map(h => [h.lng, h.lat]));

        try {
            const response = await axios.get('http://localhost:2150/fullroute', {
              headers: {
                Authorization: `Bearer ${token}`
              }
            });
            
            
            //await fetch("http://localhost:2150/fullroute");
            const data = await response.json();

            if (!data.route) {
                console.error("No route received");
                return;
            }

            localStorage.setItem("cachedRoute", JSON.stringify(data.route));
            console.log(data.route);
            if (mapRef.current) {
                const coords = L.Polyline.fromEncoded(data.route).getLatLngs(); // Decode polyline into coordinates
                L.polyline(coords, { color: "rgb(153, 204, 255)" }).addTo(mapRef.current);
                setRouteFetched(true);
            }
        } catch (error) {
            console.error("Error fetching route:", error);
        }};

    fetchHouseholds(); // get basic data first
    initializeMap(); // init the map

    // Fetch route and draw it once the map is initialized
    if (mapReady) {
        fetchRoute();
    }

    /*if (mapRef.current && taxis.length > 0) {
        // Remove old taxi markers (without touching other layers)    
        // Clear the taxiMarkers array
        //taxiMarkers.current = [];
    
        // Add new taxi markers
        taxis.forEach( (taxi,index) => {
            if (!taxiMarkers.current[index]) {
                const marker = L.marker([taxi.lat, taxi.lng], {icon: taxiIcon, id: index})
                .addTo(mapRef.current)
                .bindPopup(`Taxi ${taxi.id} - Capacity: ${taxi.capacity}`);
        
                taxiMarkers.current[index] = marker; // Store the marker for later removal
            }else{
                console.log(taxiMarkers.current[index]._latlng.lat, taxiMarkers.current[index]._latlng.lng);
                if(taxiMarkers.current[index]._latlng.lat !== taxi.lat || taxiMarkers.current[index]._latlng.lng !== taxi.lng){
                    taxiMarkers.current[index].setLatLng([taxi.lat, taxi.lng]);
                }
            }
        });
        
      }*/
    // Cleanup map when the component unmounts
    return () => {
        if (map) {
          map.remove();
        }
        if (mapRef.current) {
            mapRef.current.remove();
        }
      };
      
  }, [households, mapReady, taxis, token]);
  

  return <div id="map" style={{ height: '100vh' }}></div>;
};
Map.propTypes = {
  token: PropTypes.string.isRequired,
};

export default Map;
