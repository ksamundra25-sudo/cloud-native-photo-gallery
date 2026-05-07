document.addEventListener("DOMContentLoaded", () => {

  const themeToggle = document.getElementById("themeToggle");
  const customizeBtn = document.getElementById("customizeBtn");
  const customizePanel = document.getElementById("customizePanel");

  const accentPicker = document.getElementById("accentPicker");
  const accentPicker2 = document.getElementById("accentPicker2");

  const closeCustomize = document.getElementById("closeCustomize");

  /* Load saved theme */
  const savedTheme = localStorage.getItem("siteTheme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateButtonText(savedTheme);

  /* Toggle dark/light */
  themeToggle?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("siteTheme", next);
    updateButtonText(next);
  });

  function updateButtonText(theme){
    if(!themeToggle) return;
    themeToggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  }

  /* Open Customize */
  customizeBtn?.addEventListener("click", () => {
    customizePanel.classList.toggle("open");
  });

  closeCustomize?.addEventListener("click", () => {
    customizePanel.classList.remove("open");
  });

  /* Accent color 1 */
  accentPicker?.addEventListener("input", (e) => {
    document.documentElement.style.setProperty("--accent", e.target.value);
    localStorage.setItem("accentColor", e.target.value);
  });

  /* Accent color 2 */
  accentPicker2?.addEventListener("input", (e) => {
    document.documentElement.style.setProperty("--accent2", e.target.value);
    localStorage.setItem("accentColor2", e.target.value);
  });

  /* Load saved accent colors */
  const savedAccent = localStorage.getItem("accentColor");
  const savedAccent2 = localStorage.getItem("accentColor2");

  if(savedAccent){
    document.documentElement.style.setProperty("--accent", savedAccent);
    accentPicker.value = savedAccent;
  }

  if(savedAccent2){
    document.documentElement.style.setProperty("--accent2", savedAccent2);
    accentPicker2.value = savedAccent2;
  }

});