'use client';

import { createContext, useState } from 'react';

interface NavigationContextType {
    isMobileNavOpen: boolean;
    setIsMobileNavOpen: (isOpen: boolean) => void;
    closeMobileNav: () => void;
}


export const NavigationContext = createContext<NavigationContextType >(
    // storing the initial states of the navigation
    {
        isMobileNavOpen: false,
        setIsMobileNavOpen: () => {},
        closeMobileNav: () => {},
    }
);

export default function NavigationProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const closeMobileNav = () => setIsMobileNavOpen(false);
    
    return (
    <NavigationContext value={{ isMobileNavOpen, setIsMobileNavOpen, closeMobileNav }}>
        {children}
    </NavigationContext>

    );
}
