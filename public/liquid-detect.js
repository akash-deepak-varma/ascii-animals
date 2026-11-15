// Only Chromium can run an SVG filter inside backdrop-filter; everyone else gets frosted glass.
// A separate file (not inline) because extension pages forbid inline scripts.
if (/Chrome\//.test(navigator.userAgent)) document.documentElement.classList.add("liquid");
