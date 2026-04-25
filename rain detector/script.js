// Change this IP address to match your ESP32 on the local network.
const ESP32_IP = "10.39.88.229";
const API_URL = `http://${ESP32_IP}/data`;
const MAX_READINGS = 10;
const UPDATE_INTERVAL = 2000;
const HUMIDITY_CIRCUMFERENCE = 2 * Math.PI * 48;

const state = {
  readings: [],
  isFirstSuccess: false,
  currentTheme: localStorage.getItem("rain-dashboard-theme") || "dark",
  heavyRainVisible: false,
  lastHeavyRainTime: null,
  currentWeatherMode: "clear",
  systemLocation: getSystemLocation(),
  charts: {
    rain: null,
    temp: null,
  },
  activeValueAnimations: new Map(),
};

const elements = {
  apiUrlLabel: document.getElementById("apiUrlLabel"),
  connectionPanel: document.getElementById("connectionPanel"),
  connectionText: document.getElementById("connectionText"),
  connectionNote: document.getElementById("connectionNote"),
  signalBars: document.getElementById("signalBars"),
  lastUpdated: document.getElementById("lastUpdated"),
  readingCount: document.getElementById("readingCount"),
  rainValue: document.getElementById("rainValue"),
  rainCaption: document.getElementById("rainCaption"),
  rainCard: document.getElementById("rainCard"),
  rainBadge: document.getElementById("rainBadge"),
  rainStatusPill: document.getElementById("rainStatusPill"),
  rainStatusText: document.getElementById("rainStatusText"),
  tempValue: document.getElementById("tempValue"),
  tempBar: document.getElementById("tempBar"),
  humValue: document.getElementById("humValue"),
  humidityPercent: document.getElementById("humidityPercent"),
  humidityProgress: document.getElementById("humidityProgress"),
  pumpValue: document.getElementById("pumpValue"),
  pumpCaption: document.getElementById("pumpCaption"),
  pumpToggle: document.getElementById("pumpToggle"),
  pumpCard: document.getElementById("pumpCard"),
  weatherScene: document.getElementById("weatherScene"),
  weatherTitle: document.getElementById("weatherTitle"),
  weatherDescription: document.getElementById("weatherDescription"),
  liveClock: document.getElementById("liveClock"),
  liveDateLocation: document.getElementById("liveDateLocation"),
  lastHeavyRain: document.getElementById("lastHeavyRain"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  themeToggle: document.getElementById("themeToggle"),
  themeToggleLabel: document.getElementById("themeToggleLabel"),
  alertPopup: document.getElementById("alertPopup"),
  closeAlert: document.getElementById("closeAlert"),
};

elements.humidityProgress.style.strokeDasharray = `${HUMIDITY_CIRCUMFERENCE}`;
elements.humidityProgress.style.strokeDashoffset = `${HUMIDITY_CIRCUMFERENCE}`;
elements.apiUrlLabel.textContent = API_URL;

applyTheme(state.currentTheme);
updateClock();
setInterval(updateClock, 1000);

elements.themeToggle.addEventListener("click", () => {
  const nextTheme = state.currentTheme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  updateCharts();
});

elements.closeAlert.addEventListener("click", hideHeavyRainAlert);

initializeCharts();
fetchSensorData();
setInterval(fetchSensorData, UPDATE_INTERVAL);

async function fetchSensorData() {
  try {
    const response = await fetch(API_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    updateDashboard(data);
    setConnectionStatus(true);

    if (!state.isFirstSuccess) {
      state.isFirstSuccess = true;
      elements.loadingOverlay.classList.add("hidden");
    }
  } catch (error) {
    setConnectionStatus(false, error.message);
    elements.lastUpdated.textContent = "Waiting for device response...";

    if (!state.isFirstSuccess) {
      elements.loadingOverlay.classList.remove("hidden");
    }
  }
}

function updateDashboard(data) {
  const rain = String(data.rain ?? "--");
  const temp = Number(data.temp ?? 0);
  const hum = Number(data.hum ?? 0);
  const pump = String(data.pump ?? "OFF").toUpperCase();
  const timestamp = new Date();
  const weatherState = getWeatherState(rain);
  const rainIntensity = getRainIntensityValue(rain);

  animateNumber(elements.tempValue, temp, 600);
  animateNumber(elements.humValue, hum, 600);

  elements.rainValue.textContent = rain;
  elements.pumpValue.textContent = pump;
  elements.pumpToggle.checked = pump === "ON";
  elements.tempBar.style.width = `${(clamp(temp, 0, 60) / 60) * 100}%`;
  elements.humidityPercent.textContent = `${Math.round(hum)}%`;
  updateHumidityGauge(hum);

  elements.lastUpdated.textContent = formatTime(timestamp);
  elements.rainCaption.textContent = getRainDescription(weatherState);
  elements.pumpCaption.textContent = pump === "ON"
    ? "Pump is active. Automated water discharge and alert protection are running."
    : "Pump is in standby mode and ready for automatic activation.";

  updateRainTheme(weatherState, rain);
  updateWeatherScene(weatherState);
  updatePumpCard(pump);

  updateReadings({
    rainIntensity,
    temp,
    timestamp,
  });
  updateCharts();

  if (weatherState === "heavy") {
    state.lastHeavyRainTime = timestamp;
    elements.lastHeavyRain.textContent = `Last Heavy Rain Detected at ${formatTime(timestamp)}`;
    showHeavyRainAlert();
  } else if (state.lastHeavyRainTime) {
    elements.lastHeavyRain.textContent = `Last Heavy Rain Detected at ${formatTime(state.lastHeavyRainTime)}`;
    hideHeavyRainAlert();
  } else {
    elements.lastHeavyRain.textContent = "Last Heavy Rain Detected at --:--:--";
    hideHeavyRainAlert();
  }
}

function updateReadings(reading) {
  state.readings.push(reading);

  if (state.readings.length > MAX_READINGS) {
    state.readings.shift();
  }

  elements.readingCount.textContent = `${state.readings.length} / ${MAX_READINGS}`;
}

function setConnectionStatus(isOnline, reason = "") {
  elements.connectionPanel.classList.toggle("online", isOnline);
  elements.connectionPanel.classList.toggle("offline", !isOnline);
  elements.signalBars.classList.toggle("connected", isOnline);
  elements.signalBars.classList.toggle("offline", !isOnline);
  elements.connectionPanel.style.transition = "border-color 0.35s ease, box-shadow 0.35s ease, transform 0.35s ease";
  elements.connectionText.textContent = isOnline ? "Connected \u2705" : "Connection Error \u274C";
  elements.connectionNote.textContent = isOnline
    ? `Live API endpoint active: ${API_URL}`
    : `ESP32 connection failed${reason ? ` (${reason})` : ""}. Retrying automatically.`;
}

function updateRainTheme(weatherState, rainLabel) {
  elements.rainCard.classList.remove("status-clear", "status-light", "status-moderate", "status-heavy");

  const themeMap = {
    clear: "status-clear",
    light: "status-light",
    moderate: "status-moderate",
    heavy: "status-heavy",
  };

  const labelMap = {
    clear: "Clear",
    light: "Light Rain",
    moderate: "Moderate Rain",
    heavy: "Heavy Rain",
  };

  elements.rainCard.classList.add(themeMap[weatherState]);
  elements.rainBadge.textContent = rainLabel;
  elements.rainStatusText.textContent = labelMap[weatherState];
  elements.rainStatusPill.style.color = getRainAccent(weatherState);
}

function updateWeatherScene(weatherState) {
  state.currentWeatherMode = weatherState;
  elements.weatherScene.classList.remove("weather-clear", "weather-light-rain", "weather-moderate-rain", "weather-heavy-rain");

  const sceneClassMap = {
    clear: "weather-clear",
    light: "weather-light-rain",
    moderate: "weather-moderate-rain",
    heavy: "weather-heavy-rain",
  };

  const titleMap = {
    clear: "Clear Sky Condition",
    light: "Light Rain Activity",
    moderate: "Moderate Rainfall Detected",
    heavy: "Thunderstorm and Heavy Rain Alert",
  };

  const descriptionMap = {
    clear: "No rain detected. System remains in observation mode with stable ambient conditions.",
    light: "Small rain activity is visible. The dashboard continues continuous monitoring with light precipitation animation.",
    moderate: "Cloudy rain conditions detected. Moisture and rainfall levels are rising steadily.",
    heavy: "Heavy rain and storm-class conditions detected. Alert layer and pump automation are now prioritized.",
  };

  elements.weatherScene.classList.add(sceneClassMap[weatherState]);
  elements.weatherTitle.textContent = titleMap[weatherState];
  elements.weatherDescription.textContent = descriptionMap[weatherState];
}

function updatePumpCard(pump) {
  const isPumpOn = pump === "ON";
  elements.pumpCard.classList.toggle("pump-on", isPumpOn);
}

function updateHumidityGauge(humidity) {
  const normalized = clamp(humidity, 0, 100);
  const offset = HUMIDITY_CIRCUMFERENCE - (normalized / 100) * HUMIDITY_CIRCUMFERENCE;
  elements.humidityProgress.style.strokeDashoffset = `${offset}`;
}

function getWeatherState(rain) {
  const normalized = String(rain).toLowerCase();

  if (normalized.includes("heavy") || normalized.includes("storm")) {
    return "heavy";
  }

  if (normalized.includes("moderate") || normalized.includes("medium")) {
    return "moderate";
  }

  if (normalized.includes("light") || normalized.includes("drizzle")) {
    return "light";
  }

  if (normalized.includes("no") || normalized.includes("dry") || normalized.includes("clear")) {
    return "clear";
  }

  return "moderate";
}

function getRainDescription(weatherState) {
  const descriptions = {
    clear: "No Rain condition. Clear-sky mode is active and all rain protection systems remain ready.",
    light: "Light rain detected. Gentle precipitation is being tracked by the ESP32 sensor network.",
    moderate: "Moderate rain detected. Cloud-heavy conditions require close observation of water flow and humidity.",
    heavy: "Heavy rain detected. Critical alert animation and pump activation logic are now highlighted.",
  };

  return descriptions[weatherState];
}

function getRainIntensityValue(rain) {
  const weatherState = getWeatherState(rain);

  const map = {
    clear: 0,
    light: 35,
    moderate: 70,
    heavy: 100,
  };

  return map[weatherState];
}

function getRainAccent(weatherState) {
  const accentMap = {
    clear: "#6de5ff",
    light: "#78d5ff",
    moderate: "#ffcc67",
    heavy: "#ff5f6d",
  };

  return accentMap[weatherState];
}

function animateNumber(element, endValue, duration) {
  const previousAnimation = state.activeValueAnimations.get(element);

  if (previousAnimation) {
    cancelAnimationFrame(previousAnimation);
  }

  const startValue = Number(element.dataset.value || 0);
  const startTime = performance.now();

  function updateFrame(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentValue = startValue + (endValue - startValue) * eased;

    element.textContent = Math.round(currentValue);
    element.dataset.value = String(endValue);

    if (progress < 1) {
      const frameId = requestAnimationFrame(updateFrame);
      state.activeValueAnimations.set(element, frameId);
    } else {
      state.activeValueAnimations.delete(element);
    }
  }

  const frameId = requestAnimationFrame(updateFrame);
  state.activeValueAnimations.set(element, frameId);
}

function showHeavyRainAlert() {
  if (!state.heavyRainVisible) {
    playAlertTone();
  }

  state.heavyRainVisible = true;
  elements.alertPopup.classList.add("show");
}

function hideHeavyRainAlert() {
  state.heavyRainVisible = false;
  elements.alertPopup.classList.remove("show");
}

function playAlertTone() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const audioContext = new AudioContextClass();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(784, audioContext.currentTime);
  gainNode.gain.setValueAtTime(0.001, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.07, audioContext.currentTime + 0.03);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.32);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.34);
  oscillator.onended = () => audioContext.close();
}

function initializeCharts() {
  if (typeof Chart === "undefined") {
    return;
  }

  state.charts.rain = new Chart(document.getElementById("rainChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Rain Intensity",
          data: [],
          borderColor: "#59d7ff",
          backgroundColor: "rgba(89, 215, 255, 0.16)",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 5,
          borderWidth: 3,
        },
      ],
    },
    options: buildChartOptions("Rain Intensity"),
  });

  state.charts.temp = new Chart(document.getElementById("tempChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Temperature",
          data: [],
          borderColor: "#ff9d6c",
          backgroundColor: "rgba(255, 157, 108, 0.16)",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 5,
          borderWidth: 3,
        },
      ],
    },
    options: buildChartOptions("Temperature (\u00B0C)"),
  });

  updateCharts();
}

function buildChartOptions(labelText) {
  const theme = getThemeChartStyles();

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 500,
    },
    plugins: {
      legend: {
        labels: {
          color: theme.textColor,
          font: {
            family: "Plus Jakarta Sans",
            size: 12,
            weight: "600",
          },
        },
      },
      tooltip: {
        backgroundColor: theme.tooltipBg,
        titleColor: theme.textColor,
        bodyColor: theme.textColor,
        borderColor: theme.gridColor,
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: "Time",
          color: theme.textSoft,
        },
        ticks: {
          color: theme.textSoft,
        },
        grid: {
          color: theme.gridColor,
        },
      },
      y: {
        title: {
          display: true,
          text: labelText,
          color: theme.textSoft,
        },
        ticks: {
          color: theme.textSoft,
        },
        grid: {
          color: theme.gridColor,
        },
      },
    },
  };
}

function updateCharts() {
  if (!state.charts.rain || !state.charts.temp) {
    return;
  }

  const labels = state.readings.map((reading) => formatTime(reading.timestamp));
  const theme = getThemeChartStyles();

  state.charts.rain.data.labels = labels;
  state.charts.rain.data.datasets[0].data = state.readings.map((reading) => reading.rainIntensity);

  state.charts.temp.data.labels = labels;
  state.charts.temp.data.datasets[0].data = state.readings.map((reading) => reading.temp);

  applyChartTheme(state.charts.rain, theme);
  applyChartTheme(state.charts.temp, theme);

  state.charts.rain.update();
  state.charts.temp.update();
}

function applyChartTheme(chart, theme) {
  chart.options.plugins.legend.labels.color = theme.textColor;
  chart.options.plugins.tooltip.backgroundColor = theme.tooltipBg;
  chart.options.plugins.tooltip.titleColor = theme.textColor;
  chart.options.plugins.tooltip.bodyColor = theme.textColor;
  chart.options.plugins.tooltip.borderColor = theme.gridColor;
  chart.options.scales.x.title.color = theme.textSoft;
  chart.options.scales.x.ticks.color = theme.textSoft;
  chart.options.scales.x.grid.color = theme.gridColor;
  chart.options.scales.y.title.color = theme.textSoft;
  chart.options.scales.y.ticks.color = theme.textSoft;
  chart.options.scales.y.grid.color = theme.gridColor;
}

function getThemeChartStyles() {
  const styles = getComputedStyle(document.body);

  return {
    textColor: styles.getPropertyValue("--text-main").trim() || "#f5f8ff",
    textSoft: styles.getPropertyValue("--text-soft").trim() || "#aab9d6",
    gridColor: state.currentTheme === "light" ? "rgba(18, 44, 88, 0.1)" : "rgba(255, 255, 255, 0.08)",
    tooltipBg: state.currentTheme === "light" ? "rgba(255,255,255,0.94)" : "rgba(7,17,31,0.94)",
  };
}

function updateClock() {
  const now = new Date();
  elements.liveClock.textContent = formatTime(now);
  elements.liveDateLocation.textContent = `${state.systemLocation} | ${formatFullDate(now)}`;
}

function formatTime(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatFullDate(date) {
  return date.toLocaleDateString([], {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getSystemLocation() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  const city = timezone.split("/").pop() || "Coimbatore";
  return city.replace(/_/g, " ");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyTheme(theme) {
  state.currentTheme = theme;
  document.body.classList.toggle("theme-light", theme === "light");
  document.body.classList.toggle("theme-dark", theme !== "light");
  elements.themeToggleLabel.textContent = theme === "dark" ? "Dark" : "Light";
  localStorage.setItem("rain-dashboard-theme", theme);
}

window.addEventListener("resize", updateCharts);
