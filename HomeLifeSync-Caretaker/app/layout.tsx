import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { AppLoader } from '@/components/app-loader'
import { BackButtonHandler } from '@/components/back-button-handler'
import { ThemeProvider } from '@/components/theme-provider'
import { PageTransition } from '@/components/page-transition'
import { StatusBarManager } from '@/components/status-bar-manager'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'HomeSync Caretaker',
  description: 'Elderly care monitoring dashboard',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
      </head>
      <body className={`font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <StatusBarManager />
            <AppLoader />
            <BackButtonHandler />
            <PageTransition>
              {children}
            </PageTransition>
            <Toaster richColors position="top-center" />
            <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
