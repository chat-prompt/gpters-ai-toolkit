/**
 * Locale-aware navigation utilities
 *
 * Provides locale-aware versions of Link, redirect, usePathname, and useRouter
 * that automatically handle locale prefixes in URLs.
 */
import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
