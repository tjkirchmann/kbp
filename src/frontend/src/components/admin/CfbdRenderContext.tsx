import { createContext, useContext } from 'react'

/**
 * Rendering context passed to CFBD cell renderers.
 * Because Virtuoso Data Table cell renderers cannot receive the table's
 * `context` prop, this is provided via React Context instead.
 */
export interface CfbdRenderContextValue {
  /** Map of team/school name → logo URL (or null). */
  teamLogos: Record<string, string | null>
  /** Per-column min→max ranges for heat-map columns. Computed from displayed rows. */
  columnRanges: Record<string, { min: number; max: number }>
}

const CfbdRenderContext = createContext<CfbdRenderContextValue>({
  teamLogos: {},
  columnRanges: {},
})

export const CfbdRenderProvider = CfbdRenderContext.Provider

/** Consume CFBD render context from a cell renderer. */
export function useCfbdRender(): CfbdRenderContextValue {
  return useContext(CfbdRenderContext)
}
