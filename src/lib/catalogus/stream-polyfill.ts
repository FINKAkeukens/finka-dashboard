// pdf.js leest tekst (getTextContent) en sommige afbeeldingen met
// `for await (… of stream)` op een ReadableStream. Safari 26.3 kan een stream
// nog niet zo doorlopen ("undefined is not a function (near '...t of e...')"),
// ook niet in de legacy-build. Deze functie vult dat aan. Hij moet op zichzelf
// staan: de worker krijgt hem als tekst mee (zie extract.ts).
export function vulStreamAan() {
  const proto = typeof ReadableStream === 'undefined' ? null : (ReadableStream.prototype as unknown as Record<symbol, unknown>)
  if (!proto || proto[Symbol.asyncIterator]) return
  proto[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        yield value
      }
    } finally {
      reader.releaseLock()
    }
  }
}
