(function(){
  const RECENTS_KEY = 'weather_recents_v1';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const cityInput = $('#city-input');
  const searchBtn = $('#search-btn');
  const geoBtn = $('#geo-btn');
  const recentsBtn = $('#recents-btn');
  const recentsMenu = $('#recents-menu');
  const recentsList = $('#recents-list');
  const errorLine = $('#error-line');

  const locationLabel = $('#location-label');
  const todayIcon = $('#today-icon');
  const todayTemp = $('#today-temp');
  const todayLabel = $('#today-label');
  const todayMax = $('#today-max');
  const todayWind = $('#today-wind');
  const todayHumidity = $('#today-humidity');
  const unitToggle = $('#unit-toggle');

  const forecastGrid = $('#forecast-grid');
  const toastRoot = $('#toast-root');

  let latestWeather = null; // store last fetched weather payload
  let unitF = false; // today only

  function showToast(message, type = 'info'){
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.innerHTML = `<span>${message}</span>`;
    toastRoot.appendChild(div);
    setTimeout(() => {
      div.classList.add('fade-out');
      div.addEventListener('animationend', () => div.remove(), { once: true });
    }, 3000);
  }

  function getWeatherVisual(code){
    const rainy = (code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82);
    const cloudy = !rainy && ((code >= 3 && code <= 49) || (code >= 71 && code <= 77) || code >= 85);
    if (rainy) return { icon: 'cloud-rain', label: 'Rainy', rainy: true };
    if (cloudy) return { icon: 'cloud', label: 'Cloudy', rainy: false };
    return { icon: 'sun', label: 'Sunny', rainy: false };
  }

  const cToF = (c) => (c * 9) / 5 + 32;

  function setLoading(loading){
    if (loading){
      searchBtn.setAttribute('disabled','');
      geoBtn.setAttribute('disabled','');
      recentsBtn.setAttribute('disabled','');
    } else {
      searchBtn.removeAttribute('disabled');
      geoBtn.removeAttribute('disabled');
      if (loadRecents().length > 0) recentsBtn.removeAttribute('disabled');
    }
  }

  function loadRecents(){
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  function saveRecent(city){
    const prev = loadRecents();
    const existing = prev.filter(c => c.name !== city.name);
    const next = [city, ...existing].slice(0,5);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    renderRecents(next);
  }

  function renderRecents(list){
    recentsList.innerHTML = '';
    if (!list || list.length === 0){
      recentsBtn.setAttribute('disabled','');
      recentsMenu.classList.add('hidden');
      return;
    }
    recentsBtn.removeAttribute('disabled');
    list.forEach((c) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'w-full text-left px-3 py-2 hover:bg-neutral-100';
      btn.textContent = c.name;
      btn.addEventListener('click', async () => {
        hideRecents();
        await fetchByCoords(c.latitude, c.longitude, c.name);
      });
      li.appendChild(btn);
      recentsList.appendChild(li);
    });
  }

  function toggleRecents(){
    if (recentsMenu.classList.contains('hidden')){
      recentsMenu.classList.remove('hidden');
    } else {
      recentsMenu.classList.add('hidden');
    }
  }
  function hideRecents(){ recentsMenu.classList.add('hidden'); }

  async function fetchByCoords(lat, lon, label){
    setLoading(true);
    errorLine.classList.add('hidden');
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', String(lat));
      url.searchParams.set('longitude', String(lon));
      url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code');
      url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,relative_humidity_2m_max');
      url.searchParams.set('timezone', 'auto');

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Weather fetch failed');
      const data = await res.json();
      latestWeather = data;
      updateUI(data, label);

      const todayMaxVal = data?.daily?.temperature_2m_max?.[0];
      if (typeof todayMaxVal === 'number' && todayMaxVal > 40){
        showToast("Heat alert: Today's temperature exceeds 40°C.", 'warning');
      }
    } catch (e){
      console.error(e);
      errorLine.textContent = 'Could not retrieve weather. Please try again.';
      errorLine.classList.remove('hidden');
      showToast('Fetch failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  function updateUI(data, label){
    if (label) locationLabel.textContent = label;

    // Today
    const code = data?.current?.weather_code;
    const vis = typeof code === 'number' ? getWeatherVisual(code) : { icon: 'sun', label: '—', rainy: false };
    todayIcon.innerHTML = `<i data-lucide="${vis.icon}"></i>`;
    if (window.lucide) window.lucide.createIcons();

    const t = data?.current?.temperature_2m;
    if (typeof t === 'number'){
      const val = unitF ? cToF(t) : t;
      todayTemp.textContent = `${val.toFixed(1)}°${unitF ? 'F' : 'C'}`;
    } else todayTemp.textContent = '—';

    todayLabel.textContent = vis.label;

    const tMax = data?.daily?.temperature_2m_max?.[0];
    todayMax.textContent = typeof tMax === 'number' ? `Max: ${tMax.toFixed(1)}°C` : 'Max: —';

    const wind = data?.current?.wind_speed_10m;
    todayWind.textContent = typeof wind === 'number' ? `Wind: ${wind.toFixed(0)} km/h` : 'Wind: —';

    const hum = data?.current?.relative_humidity_2m;
    todayHumidity.textContent = typeof hum === 'number' ? `Humidity: ${hum.toFixed(0)}%` : 'Humidity: —';

    // Rainy bg toggle
    document.body.classList.toggle('rainy', !!vis.rainy);

    // Forecast (5 days)
    forecastGrid.innerHTML = '';
    const days = (data?.daily?.time || []).slice(0,5);
    days.forEach((date, i) => {
      const code = data.daily.weather_code[i];
      const vis = getWeatherVisual(code);
      const tMax = data.daily.temperature_2m_max[i];
      const tMin = data.daily.temperature_2m_min[i];
      const wind = data.daily.wind_speed_10m_max[i];
      const hum = data.daily.relative_humidity_2m_max[i];

      const d = new Date(date);
      const day = d.toLocaleDateString(undefined, { weekday: 'short' });
      const md = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      const card = document.createElement('div');
      card.className = 'rounded-lg border bg-white flex flex-col';
      card.innerHTML = `
        <div class="p-4 border-b">
          <h3 class="text-base font-semibold">${day} • ${md}</h3>
        </div>
        <div class="p-4 flex-1 text-sm">
          <div class="flex items-center gap-2 mb-2">
            <i data-lucide="${vis.icon}"></i>
            <span class="text-neutral-600">${vis.label}</span>
          </div>
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <i data-lucide="thermometer"></i>
              <span>${Number(tMax).toFixed(0)}° / ${Number(tMin).toFixed(0)}°C</span>
            </div>
            <div class="flex items-center gap-2">
              <i data-lucide="wind"></i>
              <span>Wind: ${Number(wind).toFixed(0)} km/h</span>
            </div>
            <div class="flex items-center gap-2">
              <i data-lucide="droplets"></i>
              <span>Humidity: ${Number(hum).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      `;
      forecastGrid.appendChild(card);
    });
    if (window.lucide) window.lucide.createIcons();
  }

  async function doSearch(){
    const q = (cityInput.value || '').trim();
    if (!q){
      errorLine.textContent = 'Enter a city name to search.';
      errorLine.classList.remove('hidden');
      showToast('Enter a city', 'info');
      return;
    }
    setLoading(true);
    errorLine.classList.add('hidden');
    try {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
      url.searchParams.set('name', q);
      url.searchParams.set('count', '1');
      url.searchParams.set('language', 'en');
      url.searchParams.set('format', 'json');

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Geocoding failed');
      const data = await res.json();
      const result = data?.results?.[0];
      if (!result){
        errorLine.textContent = 'No results for that city. Try another query.';
        errorLine.classList.remove('hidden');
        showToast('No results', 'error');
        return;
      }
      const label = `${result.name}${result.country ? ', ' + result.country : ''}`;
      await fetchByCoords(result.latitude, result.longitude, label);
      saveRecent({ name: label, latitude: result.latitude, longitude: result.longitude });
      cityInput.value = '';
    } catch(e){
      console.error(e);
      errorLine.textContent = 'Search failed. Please try again later.';
      errorLine.classList.remove('hidden');
      showToast('Search failed', 'error');
    } finally { setLoading(false); }
  }

  function useGeo(){
    if (!navigator.geolocation){
      errorLine.textContent = 'Geolocation is not supported in this browser.';
      errorLine.classList.remove('hidden');
      showToast('Geolocation unsupported', 'error');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      await fetchByCoords(latitude, longitude, 'My Location');
    }, (err) => {
      console.error(err);
      errorLine.textContent = 'Unable to access your location.';
      errorLine.classList.remove('hidden');
      showToast('Location denied', 'error');
      setLoading(false);
    }, { enableHighAccuracy: true, timeout: 10000 });
  }

  function initEvents(){
    searchBtn.addEventListener('click', doSearch);
    cityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    geoBtn.addEventListener('click', useGeo);

    unitToggle.addEventListener('click', () => {
      unitF = !unitF;
      unitToggle.textContent = unitF ? '°F' : '°C';
      if (latestWeather) updateUI(latestWeather);
    });

    recentsBtn.addEventListener('click', () => toggleRecents());
    document.addEventListener('click', (e) => {
      const within = e.target === recentsBtn || recentsBtn.contains(e.target) || recentsMenu.contains(e.target);
      if (!within) hideRecents();
    });
  }

  function init(){
    renderRecents(loadRecents());
    initEvents();
  }

  document.addEventListener('DOMContentLoaded', init);
})();