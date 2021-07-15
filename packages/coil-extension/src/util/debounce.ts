interface F {
  (...args: any[]): void
}

export function debounce(fn: F, wait: number): F {
  let args: any[] | null = null
  let timer: NodeJS.Timer | null = null

  function flush(): void {
    if (args !== null) fn(...args)
    args = timer = null
  }

  return function (...rest): void {
    if (timer) {
      args = rest
      clearTimeout(timer)
    } else {
      fn(...rest)
    }
    timer = setTimeout(flush, wait)
  }
}
