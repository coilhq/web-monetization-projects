export interface FrameSpec {
  tabId: number
  frameId: number
}

export function sameFrame(f1: FrameSpec, f2: FrameSpec) {
  return f1.tabId === f2.tabId && f1.frameId === f2.frameId
}
export function topFrame(f: FrameSpec): FrameSpec {
  return { tabId: f.tabId, frameId: 0 }
}
