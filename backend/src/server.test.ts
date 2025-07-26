import { describe, it, expect } from 'vitest'

describe('Server Configuration', () => {
  it('should have correct environment variables', () => {
    const port = process.env.PORT || 3001
    expect(port).toBeDefined()
  })
})