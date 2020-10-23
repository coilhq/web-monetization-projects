import { useEffect, useState } from 'react'

export function useStorage<T>(
  key: string,
  defaultValue: T,
  options = { storeWhenSet: false }
): [T, (t: T) => void] {
  const getValue = () => {
    const val = localStorage.getItem(key)
    if (val == null) {
      return defaultValue
    }
    return JSON.parse(val)
  }
  const [v, setV] = useState<T>(getValue)

  const listener = (event: StorageEvent) => {
    if (event.key === key) {
      // What about default value here?
      setV(getValue)
    }
  }

  useEffect(() => {
    window.addEventListener('storage', listener)
    return () => {
      window.removeEventListener('storage', listener)
    }
  }, [])

  const storeV = (v: T) => {
    if (options.storeWhenSet) {
      localStorage.setItem(key, JSON.stringify(v))
    }
    setV(v)
  }

  return [v, storeV]
}
