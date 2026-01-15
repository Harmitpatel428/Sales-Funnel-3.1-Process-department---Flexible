import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Gujarati } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "./components/QueryProvider";
import { LeadProvider } from "./context/LeadContext";
import { PasswordProvider } from "./context/PasswordContext";
import { ColumnProvider } from "./context/ColumnContext";
import { HeaderProvider } from "./context/HeaderContext";
import { NavigationProvider } from "./context/NavigationContext";
import { UserProvider } from "./context/UserContext";
import { TenantProvider } from "./context/TenantContext";
import { ImpersonationProvider } from "./context/ImpersonationContext";
import { CaseProvider } from "./context/CaseContext";
import { DocumentProvider } from "./context/DocumentContext";
import { TimelineProvider } from "./context/TimelineContext";
import NavigationWrapper from "./components/NavigationWrapper";
import EmployeeSetupWrapper from "./components/EmployeeSetupWrapper";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: 'swap',
});

// Optimize Gujarati font loading
const notoSansGujarati = Noto_Sans_Gujarati({
  variable: "--font-noto-sans-gujarati",
  subsets: ["gujarati"],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: "Enterprise Lead & Process Management System",
  description: "Professional Enterprise Lead Management & Process CRM System",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="gu" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{
          __html: `
          :root {
            /* Theme Colors */
            --background: #ffffff;
            --foreground: #171717;
            --primary: #8b5cf6;
            --primary-light: #a78bfa;
            --primary-dark: #7c3aed;
            --success: #10b981;
            --success-light: #34d399;
            --card-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            
            /* Performance-optimized transitions */
            --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
            --transition-normal: 300ms cubic-bezier(0.4, 0, 0.2, 1);
            
            /* Theme variable aliases */
            --color-background: var(--background);
            --color-foreground: var(--foreground);
            --font-sans: var(--font-geist-sans);
            --font-mono: var(--font-geist-mono);
            --font-gujarati: var(--font-noto-sans-gujarati);
          }
          
          @media (prefers-color-scheme: dark) {
            :root {
              --background: #0a0a0a;
              --foreground: #ededed;
              --primary: #a78bfa;
              --primary-light: #c4b5fd;
              --primary-dark: #8b5cf6;
              --success: #34d399;
              --success-light: #6ee7b7;
              --card-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.18);
            }
          }
          
          html, body {
            height: 100%;
            margin: 0;
            padding: 0;
          }
          
          body {
            background: var(--background);
            color: var(--foreground);
            font-family: var(--font-sans), var(--font-gujarati), 'Noto Sans Gujarati', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            line-height: 1.6;
            letter-spacing: -0.01em;
            overflow-x: hidden;
          }
          
          h1, h2, h3, h4, h5, h6 {
            font-weight: 600;
            line-height: 1.3;
            letter-spacing: -0.02em;
          }

          /* Critical Cursor Blob Style */
          .cursor-blob {
            position: fixed;
            width: 20px;
            height: 20px;
            background: radial-gradient(circle, rgba(147, 51, 234, 0.25) 0%, transparent 60%);
            border-radius: 50%;
            pointer-events: none;
            z-index: 9999;
            transform: translate(-50%, -50%);
            transition: opacity 0.3s ease;
            will-change: transform;
            backface-visibility: hidden;
          }
        `}} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSansGujarati.variable} antialiased bg-gray-50`}
      >
        <TenantProvider>
          <UserProvider>
            <QueryProvider>
              <LeadProvider>
                <ImpersonationProvider>
                  <CaseProvider>
                    <DocumentProvider>
                      <TimelineProvider>
                        <PasswordProvider>
                          <ColumnProvider>
                            <HeaderProvider>
                              <NavigationProvider>
                                <EmployeeSetupWrapper>
                                  <div className="flex flex-col h-screen">
                                    <NavigationWrapper />
                                    <main className="flex-1 overflow-y-auto p-0">
                                      {children}
                                    </main>
                                  </div>
                                </EmployeeSetupWrapper>
                              </NavigationProvider>
                            </HeaderProvider>
                          </ColumnProvider>
                        </PasswordProvider>
                      </TimelineProvider>
                    </DocumentProvider>
                  </CaseProvider>
                </ImpersonationProvider>
              </LeadProvider>
            </QueryProvider>
          </UserProvider>
        </TenantProvider>
      </body>
    </html>
  );
}
