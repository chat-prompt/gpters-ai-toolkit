/**
 * Locale-specific layout
 *
 * Wraps pages with NextIntlClientProvider for i18n support.
 * Sets the HTML lang attribute based on the current locale.
 */
import { notFound } from 'next/navigation'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server'
import { locales } from '@/i18n/config'
import { Providers } from '@/components/layout/Providers'
import { Geist, Geist_Mono } from 'next/font/google'
import { getBaseUrl } from '@/lib/utils/config'
import type { Metadata } from 'next'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

/**
 * Generate static params for all supported locales
 *
 * @returns Array of locale param objects
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

/**
 * Generate locale-aware metadata for the site
 *
 * @param params - Route params containing the locale
 * @returns Metadata object with localized title, description and OG tags
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'metadata.site' })
  const baseUrl = getBaseUrl()

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: t('name'),
      template: `%s | ${t('name')}`,
    },
    description: t('description'),
    keywords: [
      'Claude Code', 'AI Toolkit', 'Claude Skills', 'AI Agent',
      'Prompt Engineering', 'MCP Server', 'Anthropic', 'Claude',
    ],
    authors: [{ name: 'AI Toolkit' }],
    creator: 'AI Toolkit',
    publisher: 'AI Toolkit',
    openGraph: {
      type: 'website',
      locale: t('locale'),
      url: baseUrl,
      title: t('name'),
      description: t('description'),
      siteName: t('name'),
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: t('name') }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('name'),
      description: t('description'),
      images: ['/og-image.png'],
    },
    icons: { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
    manifest: '/site.webmanifest',
    alternates: {
      canonical: baseUrl,
      languages: { ko: baseUrl, en: `${baseUrl}/en` },
    },
  }
}

/**
 * Locale layout that provides i18n context to all child pages
 *
 * @param children - Child page content
 * @param params - Route params containing the locale
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!hasLocale(locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/*
          Pretendard — 본문 서체.
          Geist에는 한글 글리프가 없어 한글이 OS 기본 서체로 떨어졌다.
          로나(rona.so)와 같은 서체를 써서 제품 간 인상을 맞춘다.
        */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="preload"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link
          rel="stylesheet"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
          </NextIntlClientProvider>
        </Providers>
      </body>
    </html>
  )
}
