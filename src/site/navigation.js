export const PUBLIC_NAV = Object.freeze([
  Object.freeze({ href: '/', label: 'HOME' }),
  Object.freeze({ href: '/product', label: 'PRODUCT' }),
  Object.freeze({ href: '/news', label: 'NEWS' }),
  Object.freeze({ href: '/support', label: 'SUPPORT' }),
  Object.freeze({ href: '/devlog', label: 'DEV LOG' }),
]);

export const isActivePublicRoute = (pathname, href) => {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
};
