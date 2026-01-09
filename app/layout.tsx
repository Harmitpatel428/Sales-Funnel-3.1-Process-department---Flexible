import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LeadProvider } from "./context/LeadContext";
import { PasswordProvider } from "./context/PasswordContext";
import { ColumnProvider } from "./context/ColumnContext";
import { HeaderProvider } from "./context/HeaderContext";
import { NavigationProvider } from "./context/NavigationContext";
import { UserProvider } from "./context/UserContext";
import { ImpersonationProvider } from "./context/ImpersonationContext";
import { CaseProvider } from "./context/CaseContext";
import { DocumentProvider } from "./context/DocumentContext";
import { TimelineProvider } from "./context/TimelineContext";
import NavigationWrapper from "./components/NavigationWrapper";
import EmployeeSetupWrapper from "./components/EmployeeSetupWrapper";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html lang="gu">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50`}
      >
        <LeadProvider>
          <UserProvider>
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
          </UserProvider>
        </LeadProvider>
      </body>
    </html>
  );
}
