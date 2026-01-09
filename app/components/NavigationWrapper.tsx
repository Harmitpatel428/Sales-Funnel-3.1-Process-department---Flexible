'use client';

import { useNavigation } from '../context/NavigationContext';
import Navigation from './Navigation';
import ImpersonationBanner from './ImpersonationBanner';
export default function NavigationWrapper() {
  const { onExportClick } = useNavigation();

  return (
    <>
      <ImpersonationBanner />
      <Navigation
        onExportClick={onExportClick}
      />
    </>
  );
}
