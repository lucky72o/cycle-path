import { useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { routes } from 'wasp/client/router';
import { useAuth } from 'wasp/client/auth';
import './Main.css';
import NavBar from './components/NavBar/NavBar';
import { demoNavigationitems, marketingNavigationItems } from './components/NavBar/constants';
import CookieConsentBanner from './components/cookie-consent/Banner';

/**
 * use this component to wrap all child components
 * this is useful for templates, themes, and context
 */
export default function App() {
  const location = useLocation();
  const { data: user } = useAuth();
  
  const isMarketingPage = useMemo(() => {
    return location.pathname === '/' || location.pathname.startsWith('/pricing');
  }, [location]);

  // If user is logged in, always show demo navigation (which includes "My Cycles")
  // Otherwise, show marketing navigation on marketing pages
  const navigationItems = user ? demoNavigationitems : (isMarketingPage ? marketingNavigationItems : demoNavigationitems);

  const shouldDisplayAppNavBar = useMemo(() => {
    return (
      location.pathname !== routes.LoginRoute.build() && location.pathname !== routes.SignupRoute.build()
    );
  }, [location]);

  const isAdminDashboard = useMemo(() => {
    return location.pathname.startsWith('/admin');
  }, [location]);

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView();
      }
    }
  }, [location]);

  return (
    <>
      <div className='min-h-screen bg-background text-foreground'>
        {isAdminDashboard ? (
          <Outlet />
        ) : (
          <>
            {shouldDisplayAppNavBar && <NavBar navigationItems={navigationItems} />}
            <div className='mx-auto max-w-screen-2xl'>
              <Outlet />
            </div>
          </>
        )}
      </div>
      <CookieConsentBanner />
    </>
  );
}
