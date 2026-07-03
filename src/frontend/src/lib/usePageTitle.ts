import { useEffect } from 'react'

/**
 * Sets document.title for the current page.
 * Pass a page-level label e.g. "Record Book" → "KBP | Record Book".
 * Pass an empty string (or omit) for the root home title.
 */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `KBP | ${title}` : 'Kirchmann Bowl Pool'
  }, [title])
}
