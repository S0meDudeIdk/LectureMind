import { createContext, useContext } from 'react';

const SidebarContext = createContext({ sidebarOpen: true });

export const SidebarProvider = SidebarContext.Provider;

export const useSidebar = () => useContext(SidebarContext);
