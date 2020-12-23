import { EventEmitter } from 'events'

import { inject, injectable } from 'inversify'
import * as tokens from '@web-monetization/wext/tokens'

import { flatMapSlow } from '../util/flatMapSlow'
import { getFrameSpec } from '../../util/tabs'
import {
  Command,
  ToBackgroundMessage,
  ToContentMessage
} from '../../types/commands'
import { FrameSpec, sameFrame } from '../../types/FrameSpec'
import { timeout } from '../../content/util/timeout'
import { notNullOrUndef } from '../../util/nullables'

import { logger, Logger } from './utils'

import GetFrameResultDetails = chrome.webNavigation.GetFrameResultDetails
import MessageSender = chrome.runtime.MessageSender

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Frame extends Record<string, any> {
  // TODO: this seems useless actually
  lastUpdateTimeMS: number

  /**
   *loading
   *    The document is still loading.
   * interactive
   *    The document has finished loading and the document has been parsed but
   *    sub-resources such as images, stylesheets and frames are still loading.
   * complete
   *    The document and all sub-resources have finished loading. The state
   *    indicates that the load event is about to fire.
   */
  state: Document['readyState'] | null
  /**
   * Url kept up to date via webNavigation apis and content script
   * readystatechange listener messages
   */
  href: string
  /**
   * Top iframe
   */
  top: boolean
  /**
   * Will be 0 for topmost iframe
   */
  frameId: number

  /**
   * Will be -1 for topmost iframe
   */
  parentFrameId: number
}

/**
 * We don't check for state, which could be null (a transient state where
 * it is undetermined due to webNavigation api limitations)
 *
 * Note that in the case where don't have the state we inject a script to send
 * a message to the frames content script to send a message with the current
 * document.readyState.
 *
 */
const isFullFrame = (partial: Partial<Frame>): partial is Frame => {
  return Boolean(
    // typeof partial.state === 'string' &&
    typeof partial.frameId === 'number' &&
      typeof partial.parentFrameId === 'number' &&
      typeof partial.href === 'string' &&
      typeof partial.top === 'boolean' &&
      typeof partial.lastUpdateTimeMS === 'number'
  )
}

export interface FrameEvent {
  type: string
  from: string
  tabId: number
  frameId: number
}

export interface FrameEventWithFrame extends FrameEvent {
  frame: Frame
}

export interface FrameRemovedEvent extends FrameEvent {
  type: 'frameRemoved'
}

export interface FrameAddedEvent extends FrameEventWithFrame {
  type: 'frameAdded'
}

export interface FrameChangedEvent extends FrameEventWithFrame {
  type: 'frameChanged'
  changed: Partial<Frame>
}

@injectable()
export class BackgroundFramesService extends EventEmitter {
  tabs: Record<number, Array<Frame>> = {}
  traceLogging = false
  logEvents = false
  logTabsInterval = 0

  // noinspection TypeScriptFieldCanBeMadeReadonly
  constructor(
    @logger('BackgroundFramesService')
    private log: Logger,
    @inject(tokens.WextApi)
    private api = chrome
  ) {
    super()
  }

  getFrame(frame: FrameSpec): Readonly<Frame> | undefined {
    const frames = this.getFrames(frame.tabId)
    return frames.find(f => {
      return f.frameId == frame.frameId
    })
  }

  getFrameNotNull(frame: FrameSpec): Readonly<Frame> {
    return notNullOrUndef(
      this.getFrame(frame),
      `getFrame(${JSON.stringify(frame)})`
    )
  }

  async getFrameAsync(
    frame: FrameSpec,
    waitMs = 2e3
  ): Promise<Readonly<Frame> | undefined> {
    const alreadyHave = this.getFrame(frame)
    if (alreadyHave) {
      return alreadyHave
    }
    return new Promise<Readonly<Frame> | undefined>(resolve => {
      const handler = (addedFrame: FrameAddedEvent) => {
        if (sameFrame(frame, addedFrame)) {
          this.removeListener('frameAdded', handler)
          resolve(this.getFrame(frame))
        }
      }
      this.on('frameAdded', handler)
      timeout(waitMs).then(() => {
        this.removeListener('frameAdded', handler)
        resolve(undefined)
      })
    })
  }

  getChildren(frame: FrameSpec): Array<Readonly<Frame>> {
    const frames = this.getFrames(frame.tabId)
    const directChildren = frames.filter(f => {
      return f.parentFrameId == frame.frameId
    })
    return directChildren.concat(
      flatMapSlow(directChildren, fs =>
        this.getChildren({ tabId: frame.tabId, frameId: fs.frameId })
      )
    )
  }

  getFrames(tabId: number): Array<Readonly<Frame>> {
    return (this.tabs[tabId] = this.tabs[tabId] ?? [])
  }

  updateOrAddFrame(
    from: string,
    { tabId, frameId }: FrameSpec,
    partial: Readonly<Partial<Frame>>
  ) {
    const lastUpdateTimeMS = partial.lastUpdateTimeMS ?? Date.now()
    const frame = this.getFrame({ tabId, frameId })
    if (frame && frame.lastUpdateTimeMS > lastUpdateTimeMS) {
      if (this.traceLogging) {
        this.log('ignoring frame update', { tabId, frameId, changed: partial })
      }
      return
    }
    const update = { lastUpdateTimeMS, ...partial }
    const frames = this.getFrames(tabId)
    const changed: Partial<Frame> = {}
    let changes = 0

    if (!frame) {
      if (isFullFrame(update)) {
        frames.push(update)
        const event: FrameAddedEvent = {
          type: 'frameAdded',
          from,
          tabId,
          frameId,
          frame: update
        }
        const changedEvent: FrameChangedEvent = {
          ...event,
          type: 'frameChanged',
          changed: update
        }
        this.emit(event.type, event)
        this.emit(changedEvent.type, changedEvent)
      } else {
        this.log(
          'ERROR in frameAdded from=%s update=%s',
          from,
          JSON.stringify(update)
        )
      }
    } else if (frame) {
      Object.entries(update).forEach(([key, val]) => {
        if (frame[key] !== val && val != null) {
          // Mutate the frame in place
          ;(frame as Frame)[key] = val
          changed[key] = val
          if (key !== 'lastUpdateTimeMS') {
            changes++
          }
        }
      })
      if (changes) {
        const changedEvent: FrameChangedEvent = {
          type: 'frameChanged',
          from,
          tabId,
          frameId,
          changed,
          frame
        }
        this.emit(changedEvent.type, changedEvent)
      }
    }
  }

  private async getWebNavigationFrame({
    tabId,
    frameId
  }: FrameSpec): Promise<GetFrameResultDetails> {
    return new Promise((resolve, reject) => {
      this.api.webNavigation.getFrame({ tabId, frameId }, frame => {
        if (frame) {
          resolve(frame)
        } else {
          const spec = JSON.stringify({ tabId, frameId })
          reject(new Error(`invalid_frame_spec: can not get frame for ${spec}`))
        }
      })
    })
  }

  monitor() {
    const events = ['frameChanged', 'frameAdded', 'frameRemoved'] as const

    if (this.logEvents) {
      events.forEach(e => {
        this.on(e, (event: FrameEvent) => {
          this.log(e, JSON.stringify(event, null, 2))
        })
      })
    }

    /**
     * Be wary of context invalidation during extension reloading causing
     * confusion here.
     *
     * This will pick up state from tabs which need reloading to refresh the
     * context state.
     *
     * Perhaps should periodically prune, at least in dev mode.
     *
     * TODO: Is there a webNavigation (read: not content script) API for
     *       determining window unload ?
     *
     * {@see Frames#sendUnloadMessage}
     */
    this.api.tabs.query({}, tabs => {
      tabs.forEach(tab => {
        if (tab.id) {
          this.useWebNavigationToUpdateFrames(tab.id)
        }
      })
    })

    if (this.logTabsInterval) {
      setInterval(() => {
        this.logTabs()
      }, this.logTabsInterval)
    }

    const makeCallback = (event: string) => {
      return (details: {
        url: string
        tabId: number
        frameId: number
        parentFrameId?: number
      }) => {
        if (
          !details.url.startsWith('http') ||
          (details.parentFrameId !== 0 && details.frameId !== 0)
        ) {
          return
        }
        const frameSpec = {
          tabId: details.tabId,
          frameId: details.frameId
        }
        const frame = this.getFrame(frameSpec)
        this.log('webNavigation.' + event)
        if (this.traceLogging) {
          this.log('webNavigation.%s details:%o frame=%o', event, details, {
            frame
          })
        }
        const partial = {
          href: details.url,
          frameId: details.frameId,
          parentFrameId: details.parentFrameId,
          state: null,
          top: details.frameId === 0
        }
        this.updateOrAddFrame(`webNavigation.${event}`, frameSpec, partial)
        if (this.getFrame(frameSpec)?.state == null) {
          this.requestFrameState(frameSpec)
        }
      }
    }

    this.api.webNavigation.onHistoryStateUpdated.addListener(
      makeCallback('onHistoryStateUpdated')
    )
    this.api.webNavigation.onReferenceFragmentUpdated.addListener(
      makeCallback('onReferenceFragmentUpdated')
    )

    // These are required otherwise there's a race between usages of getFrameOrDefault()
    // and the initial `useWebNavigationToUpdateFrames()`
    this.api.webNavigation.onCommitted.addListener(makeCallback('onCommitted'))
    this.api.webNavigation.onCompleted.addListener(makeCallback('onCompleted'))
    this.api.webNavigation.onBeforeNavigate.addListener(
      makeCallback('onBeforeNavigate')
    )

    this.api.tabs.onRemoved.addListener(tabId => {
      this.log('tabs.onTabRemoved %s', tabId)
      delete this.tabs[tabId]
    })

    this.api.runtime.onMessage.addListener(
      (message: ToBackgroundMessage, sender) => {
        // Important: On Firefox, don't return a Promise directly (e.g. async
        // function) else other listeners do not get run!!
        // See: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage
        void this.onMessageAsync(sender, message)
      }
    )
  }

  sendCommandToFramesMatching(
    cmd: ToContentMessage,
    matcher: (frame: Frame) => boolean
  ) {
    for (const [tabId, framesList] of Object.entries(this.tabs)) {
      for (const frame of framesList) {
        if (matcher(frame)) {
          this.api.tabs.sendMessage(Number(tabId), cmd, {
            frameId: frame.frameId
          })
        }
      }
    }
  }

  async sendCommand<C extends Command, R>(
    { tabId, frameId }: FrameSpec,
    command: C
  ): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      this.api.tabs.sendMessage(tabId, command, { frameId }, (result: R) => {
        if (this.api.runtime.lastError) {
          reject(this.api.runtime.lastError)
        } else {
          resolve(result)
        }
      })
    })
  }

  private async onMessageAsync(
    sender: MessageSender,
    message: ToBackgroundMessage
  ) {
    if (!sender.tab) {
      this.log('onMessage, no tab', JSON.stringify({ message, sender }))
      return
    }

    const { tabId, frameId, spec: frameSpec } = getFrameSpec(sender)

    if (message.command === 'unloadFrame') {
      this.log('unloadFrame %s', frameId, message.data)
      const frames = (this.tabs[tabId] = this.tabs[tabId] ?? [])
      const ix = frames.findIndex(f => f.frameId === frameId)
      if (ix !== -1) {
        this.log('removing', ix)
        frames.splice(ix, 1)
        const removedEvent: FrameRemovedEvent = {
          from: 'unloadFrame',
          type: 'frameRemoved',
          frameId,
          tabId
        }
        this.emit(removedEvent.type, removedEvent)
      }
      if (frames.length === 0) {
        delete this.tabs[tabId]
      }
    } else if (message.command === 'frameStateChange') {
      if (this.traceLogging) {
        this.log(
          'frameStateChange, frameId=%s, tabId=%s, message=%s',
          sender.frameId,
          tabId,
          JSON.stringify(message, null, 2)
        )
      }

      const { href, state } = message.data
      const frame = this.getFrame(frameSpec)
      if (frame) {
        // top and frameId, parentFrameId don't change
        this.updateOrAddFrame('frameStateChange', frameSpec, {
          href,
          state
        })
      } else {
        const navFrame = await this.getWebNavigationFrame(frameSpec)
        this.updateOrAddFrame('frameStateChange', frameSpec, {
          frameId,
          href: navFrame.url,
          state,
          top: frameId === 0,
          parentFrameId: navFrame.parentFrameId
        })
      }
    }
  }

  private useWebNavigationToUpdateFrames(tabId: number) {
    this.api.webNavigation.getAllFrames({ tabId }, frames => {
      frames?.forEach(frame => {
        if (
          !frame.url.startsWith('http') ||
          (frame.frameId !== 0 && frame.parentFrameId !== 0)
        ) {
          return
        }
        const frameSpec = { tabId, frameId: frame.frameId }
        this.updateOrAddFrame('useWebNavigationToUpdateFrames', frameSpec, {
          frameId: frame.frameId,
          top: frame.frameId === 0,
          href: frame.url,
          state: null,
          parentFrameId: frame.parentFrameId
        })
        if (this.getFrame(frameSpec)?.state == null) {
          this.requestFrameState(frameSpec)
        }
      })
    })
  }

  /**
   * Somewhat interestingly, this seems to work even when a content script context
   * is invalidated.
   */
  private requestFrameState({ tabId, frameId }: FrameSpec) {
    this.api.tabs.executeScript(
      tabId,
      {
        frameId: frameId,
        // language=JavaScript
        code: `
          (function sendMessage() {
            const frameStateChange = {
              command: 'frameStateChange',
              data: {
                state: document.readyState,
                href: window.location.href
              }
            }
            chrome.runtime.sendMessage(frameStateChange)
          })()
        `
      },
      () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const ignored = this.api.runtime.lastError
      }
    )
  }

  private logTabs() {
    this.log('tabs', JSON.stringify(this.tabs, null, 2))
  }
}

export type FrameEvents =
  | FrameAddedEvent
  | FrameRemovedEvent
  | FrameChangedEvent

export type FramesEventType = FrameEvents['type']

export interface FramesEventMap extends Record<FramesEventType, FrameEvents> {
  frameAdded: FrameAddedEvent
  frameRemoved: FrameRemovedEvent
  frameChanged: FrameChangedEvent
}
export interface BackgroundFramesService extends EventEmitter {
  on<T extends FramesEventType>(
    event: T,
    listener: (ev: FramesEventMap[T]) => void
  ): this
  once<T extends FramesEventType>(
    event: T,
    listener: (ev: FramesEventMap[T]) => void
  ): this
  emit<T extends FramesEventType>(event: T, ev: FramesEventMap[T]): boolean
}
