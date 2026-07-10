// Tipagem minima para `seedrandom` (a lib nao traz .d.ts e @types/seedrandom
// nao esta na stack fechada). Cobre so o uso deste projeto: uma PRNG
// deterministica a partir de uma seed string.
declare module 'seedrandom' {
  export default function seedrandom(seed?: string): () => number
}
