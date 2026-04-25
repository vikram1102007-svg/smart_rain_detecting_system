// Change this IP address whenever your ESP32 gets a new one.
const ESP32_IP = "10.39.88.229";
const ESP32_DATA_URL = `http://${ESP32_IP}/data`;

// Get all dashboard elements once so we can reuse them easily.
const rainValue = document.getElementById("rainValue");
const tempValue = document.getElementById("tempValue");
const humValue = document.getElementById("humValue");
const pumpValue = document.getElementById("pumpValue");
const lastUpdated = document.getElementById("lastUpdated");
const alertBox = document.getElementById("alertBox");

// Map each rain label to the CSS class that controls its color.
const rainClassMap = {
  "No Rain": "rain-no-rain",
  "Light Rain": "rain-light-rain",
  "Moderate Rain": "rain-moderate-rain",
  "Heavy Rain": "rain-heavy-rain"
};

// Update the rain badge text, color, and heavy rain alert animation.
function updateRainUI(rainLevel) {
  rainValue.textContent = rainLevel;

  Object.values(rainClassMap).forEach((className) => {
    rainValue.classList.remove(className);
  });

  const rainClass = rainClassMap[rainLevel] || "rain-no-rain";
  rainValue.classList.add(rainClass);

  if (rainLevel === "Heavy Rain") {
    alertBox.classList.remove("hidden");
    alertBox.classList.add("alert-active");
  } else {
    alertBox.classList.add("hidden");
    alertBox.classList.remove("alert-active");
  }
}

// Update the pump text and apply the correct ON/OFF style.
function updatePumpUI(pumpStatus) {
  pumpValue.textContent = pumpStatus;
  pumpValue.classList.remove("pump-on", "pump-off");
  pumpValue.classList.add(pumpStatus === "ON" ? "pump-on" : "pump-off");
}

// Show the current time after a successful data refresh.
function updateTimestamp() {
  lastUpdated.textContent = new Date().toLocaleTimeString();
}

// Put the received sensor values into the dashboard.
function updateDashboard(data) {
  updateRainUI(data.rain || "No Rain");
  tempValue.textContent = `${data.temp ?? "--"}\u00B0C`;
  humValue.textContent = `${data.hum ?? "--"}%`;
  updatePumpUI(data.pump || "OFF");
  updateTimestamp();
}

// Fetch the latest data from the ESP32.
// If the request fails, keep the old values on screen and only show a connection message.
async function fetchSensorData() {
  try {
    const response = await fetch(ESP32_DATA_URL);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();
    updateDashboard(data);
  } catch (error) {
    console.error("Failed to fetch sensor data from ESP32:", error);
    lastUpdated.textContent = "Connection error";
  }
}

// Load data once when the page opens.
fetchSensorData();

// Refresh the data every 2 seconds.
setInterval(fetchSensorData, 2000);
