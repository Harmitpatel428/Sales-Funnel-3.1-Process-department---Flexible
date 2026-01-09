'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, memo } from 'react';
import { useUsers } from '../context/UserContext';
import LoginModal from './LoginModal';

interface NavigationProps {
  onExportClick?: () => void;
}

const Navigation = memo(function Navigation({ onExportClick }: NavigationProps) {
  const pathname = usePathname();
  const { currentUser, logout, isAuthenticated, canViewAllCases, canManageCases, canAccessSalesDashboard, canAccessProcessDashboard } = useUsers();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Update current date/time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Check if user should see Cases link (matches RoleGuard in /cases)
  const showCasesLink = isAuthenticated && (canManageCases() || canViewAllCases() || currentUser?.role === 'SALES_MANAGER');
  // Process Dashboard might be different from Sales Dashboard
  const showDashboardLink = isAuthenticated;

  return (
    <>
      <nav className="bg-white shadow-sm sticky top-0 z-10 backdrop-blur-sm bg-opacity-90 transition-all duration-300">
        <div className="max-w-[1920px] mx-auto px-4 py-0.5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <div className="font-bold text-lg text-purple-700 tracking-tight hover:text-purple-600 transition-colors">
                CRM
              </div>

              {isAuthenticated && (
                <div className="flex space-x-2">
                  <Link
                    href="/"
                    className={`px-3 py-1.5 rounded-md font-medium transition-all duration-300 text-sm ${pathname === '/'
                      ? 'bg-purple-100 text-purple-700 shadow-sm'
                      : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'}`}
                  >
                    Home
                  </Link>
                  {canAccessSalesDashboard() && (
                    <Link
                      href="/dashboard"
                      className={`px-3 py-1.5 rounded-md font-medium transition-all duration-300 text-sm ${pathname === '/dashboard'
                        ? 'bg-purple-100 text-purple-700 shadow-sm'
                        : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'}`}
                    >
                      Sales Dashboard
                    </Link>
                  )}
                  {canAccessProcessDashboard() && (
                    <Link
                      href="/process-dashboard"
                      className={`px-3 py-1.5 rounded-md font-medium transition-all duration-300 text-sm ${pathname === '/process-dashboard'
                        ? 'bg-purple-100 text-purple-700 shadow-sm'
                        : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'}`}
                    >
                      Process Dashboard
                    </Link>
                  )}
                  <Link
                    href="/add-lead"
                    className={`px-3 py-1.5 rounded-md font-medium transition-all duration-300 text-sm ${pathname === '/add-lead'
                      ? 'bg-purple-100 text-purple-700 shadow-sm'
                      : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'}`}
                  >
                    Add Lead
                  </Link>

                  {showCasesLink && (
                    <Link
                      href="/cases"
                      className={`px-3 py-1.5 rounded-md font-medium transition-all duration-300 text-sm ${pathname.startsWith('/cases')
                        ? 'bg-purple-100 text-purple-700 shadow-sm'
                        : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'}`}
                    >
                      Process Cases
                    </Link>
                  )}

                  {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PROCESS_MANAGER') && (
                    <Link
                      href="/reports"
                      className={`px-3 py-1.5 rounded-md font-medium transition-all duration-300 text-sm ${pathname.startsWith('/reports')
                        ? 'bg-purple-100 text-purple-700 shadow-sm'
                        : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'}`}
                    >
                      Reports
                    </Link>
                  )}

                  {currentUser?.role === 'ADMIN' && (
                    <Link
                      href="/users"
                      className={`px-3 py-1.5 rounded-md font-medium transition-all duration-300 text-sm ${pathname.startsWith('/users')
                        ? 'bg-purple-100 text-purple-700 shadow-sm'
                        : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'}`}
                    >
                      Users
                    </Link>
                  )}


                </div>
              )}
            </div>

            {/* Controls and Clock */}
            <div className="flex items-center space-x-4">
              {/* User Profile / Login */}
              {isAuthenticated ? (
                <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
                  <div className="flex flex-col items-end">
                    <Link
                      href="/profile"
                      className="text-sm font-semibold text-gray-700 hover:text-purple-600 cursor-pointer transition-colors"
                      title="Go to Profile"
                    >
                      {currentUser?.name}
                    </Link>
                    <span className="text-xs text-purple-600 font-medium bg-purple-50 px-1.5 rounded">{currentUser?.role.replace(/_/g, ' ')}</span>
                  </div>
                  <Link
                    href="/profile"
                    className={`p-1.5 rounded-full transition-colors ${pathname === '/profile'
                      ? 'text-purple-600 bg-purple-100'
                      : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'
                      }`}
                    title="Profile Settings"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </Link>
                  <button
                    onClick={() => {
                      // Clear impersonation session on logout
                      sessionStorage.removeItem('impersonationSession');
                      logout();
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    title="Logout"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="px-4 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 shadow-sm transition-colors"
                >
                  Sign In
                </button>
              )}

              {/* Clock */}
              <div className="hidden md:block relative bg-white border border-gray-200 rounded-md p-1.5 shadow-sm">
                <div className="text-center flex items-center space-x-2">
                  <div className="text-xs font-bold text-gray-800 tracking-wider w-16">
                    {currentDateTime.toLocaleTimeString('en-US', {
                      hour12: true,
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                  <div className="text-[10px] text-gray-500 font-normal border-l border-gray-200 pl-2">
                    {currentDateTime.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Login Modal */}
      <LoginModal isOpen={showLoginModal} onLoginSuccess={() => setShowLoginModal(false)} />

      {/* Auto-show login if not authenticated */}
      {!isAuthenticated && <LoginModal isOpen={true} />}
    </>
  );
});

export default Navigation;
