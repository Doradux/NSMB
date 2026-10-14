'use strict';
const links = [...document.querySelectorAll('.desktop-nav a')];
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const link of links) {
        const selected = link.getAttribute('href') === '#' + entry.target.id;
        if (selected) link.setAttribute('aria-current','location');
        else link.removeAttribute('aria-current');
      }
    }
  },{rootMargin:'-30% 0px -60% 0px'});
  for (const link of links) {
    const section = document.querySelector(link.getAttribute('href'));
    if (section) observer.observe(section);
  }
}
