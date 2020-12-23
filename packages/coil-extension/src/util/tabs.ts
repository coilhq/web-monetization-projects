import { FrameSpec } from '../types/FrameSpec'

import { notNullOrUndef } from './nullables'

import MessageSender = chrome.runtime.MessageSender

export function getTab(sender: { tab?: { id?: number } }): number {
  return notNullOrUndef(notNullOrUndef(sender.tab, 'sender.tab').id, 'tab.id')
}

export function getFrameSpec(
  sender: MessageSender
): FrameSpec & { spec: FrameSpec } {
  const tabId = getTab(sender)
  const frameId = notNullOrUndef(sender.frameId, 'sender.frameId')
  const spec = { tabId, frameId }
  return { ...spec, spec }
}
