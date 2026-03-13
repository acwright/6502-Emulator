import { SNESAttachment } from '../../../components/IO/Attachments/SNESAttachment'

// Helper: pulse LATCH (write LATCH high then low) to a SNESAttachment via Port A or B
function latch(snes: SNESAttachment, usePortA: boolean): void {
  const LATCH = 0x02
  if (usePortA) {
    snes.writePortA(LATCH, 0xFF)
    snes.writePortA(0x00, 0xFF)
  } else {
    snes.writePortB(LATCH, 0xFF)
    snes.writePortB(0x00, 0xFF)
  }
}

// Helper: pulse CLK falling edge (high → low) to advance to the next bit
function clockFalling(snes: SNESAttachment, usePortA: boolean): void {
  const CLK = 0x01
  if (usePortA) {
    snes.writePortA(CLK, 0xFF)
    snes.writePortA(0x00, 0xFF)
  } else {
    snes.writePortB(CLK, 0xFF)
    snes.writePortB(0x00, 0xFF)
  }
}

// Helper: read 16 bits from DATA1 (bit 2) and DATA2 (bit 3) in shift-register order.
// Returns [data1, data2] each as a 16-bit integer (bit 0 = first bit received).
function readAllBits(snes: SNESAttachment, usePortA: boolean): [number, number] {
  const DATA1 = 0x04
  const DATA2 = 0x08

  let data1 = 0
  let data2 = 0

  for (let i = 0; i < 16; i++) {
    const val = usePortA
      ? snes.readPortA(0x00, 0x00)
      : snes.readPortB(0x00, 0x00)

    // Active-low: bit absent in val means pressed (0 in shift register)
    const bit1 = (val & DATA1) !== 0 ? 1 : 0
    const bit2 = (val & DATA2) !== 0 ? 1 : 0

    data1 |= (bit1 << i)
    data2 |= (bit2 << i)

    if (i < 15) {
      clockFalling(snes, usePortA)
    }
  }

  return [data1, data2]
}

describe('SNESAttachment', () => {
  describe('button constants', () => {
    it('should match the index.ts / JoystickAttachment values', () => {
      expect(SNESAttachment.BUTTON_UP).toBe(0x01)
      expect(SNESAttachment.BUTTON_DOWN).toBe(0x02)
      expect(SNESAttachment.BUTTON_LEFT).toBe(0x04)
      expect(SNESAttachment.BUTTON_RIGHT).toBe(0x08)
      expect(SNESAttachment.BUTTON_A).toBe(0x10)
      expect(SNESAttachment.BUTTON_B).toBe(0x20)
      expect(SNESAttachment.BUTTON_SELECT).toBe(0x40)
      expect(SNESAttachment.BUTTON_START).toBe(0x80)
    })
  })

  describe('constructor, reset and defaults', () => {
    it('should be enabled by default', () => {
      const snes = new SNESAttachment(true)
      expect(snes.isEnabled()).toBe(true)
    })

    it('should have no interrupts by default', () => {
      const snes = new SNESAttachment(true)
      expect(snes.hasCA1Interrupt()).toBe(false)
      expect(snes.hasCA2Interrupt()).toBe(false)
      expect(snes.hasCB1Interrupt()).toBe(false)
      expect(snes.hasCB2Interrupt()).toBe(false)
    })

    it('should respect the supplied priority', () => {
      const snes = new SNESAttachment(true, 7)
      expect(snes.getPriority()).toBe(7)
    })

    it('should return 0xFF on both ports before any latch when no buttons pressed', () => {
      const snes = new SNESAttachment(true)
      expect(snes.readPortA(0x00, 0x00)).toBe(0xFF)
      expect(snes.readPortB(0x00, 0x00)).toBe(0xFF)
    })

    it('should reset shift state and button state', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_A)
      latch(snes, true)
      snes.reset()
      // After reset, shift register is all 1s again (no buttons)
      expect(snes.readPortA(0x00, 0x00)).toBe(0xFF)
    })
  })

  describe('port routing', () => {
    it('Port-A attachment responds on readPortA and not readPortB', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_B)
      latch(snes, true)
      // DATA1 (bit 2) should be 0 (B is bit 0, active-low)
      expect(snes.readPortA(0x00, 0x00) & 0x04).toBe(0x00)
      // Port B should still be 0xFF
      expect(snes.readPortB(0x00, 0x00)).toBe(0xFF)
    })

    it('Port-B attachment responds on readPortB and not readPortA', () => {
      const snes = new SNESAttachment(false)
      snes.updateController1(SNESAttachment.BUTTON_B)
      latch(snes, false)
      expect(snes.readPortB(0x00, 0x00) & 0x04).toBe(0x00)
      expect(snes.readPortA(0x00, 0x00)).toBe(0xFF)
    })

    it('A write to Port B is ignored when attached to Port A', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_B)
      // Latch via Port B — should be ignored
      snes.writePortB(0x02, 0xFF)
      snes.writePortB(0x00, 0xFF)
      // DATA1 still reflects pre-latch (all 1s)
      expect(snes.readPortA(0x00, 0x00) & 0x04).toBe(0x04)
    })
  })

  describe('LATCH behaviour', () => {
    it('rising LATCH edge captures button state', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_B)   // B → bit 0 in shift reg
      latch(snes, true)
      // Bit 0 of shift register 1 should be 0 (active-low, B pressed)
      expect(snes.readPortA(0x00, 0x00) & 0x04).toBe(0x00)
    })

    it('LATCH captures the state at latch time, not later updates', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_B)
      latch(snes, true)
      // Change buttons after latch — shift register should not change
      snes.updateController1(0x00)
      expect(snes.readPortA(0x00, 0x00) & 0x04).toBe(0x00)
    })

    it('re-latching re-samples the updated button state', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_B)
      latch(snes, true)
      snes.updateController1(0x00)
      latch(snes, true) // re-latch with no buttons
      // Now B bit should be 1 (not pressed)
      expect(snes.readPortA(0x00, 0x00) & 0x04).toBe(0x04)
    })

    it('LATCH resets bit index back to 0', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_B)
      latch(snes, true)
      // Advance several bits
      clockFalling(snes, true)
      clockFalling(snes, true)
      clockFalling(snes, true)
      // Re-latch should reset to bit 0
      latch(snes, true)
      expect(snes.readPortA(0x00, 0x00) & 0x04).toBe(0x00) // B still pressed at bit 0
    })
  })

  describe('CLK / shift register behaviour', () => {
    it('each CLK falling edge advances to the next bit', () => {
      const snes = new SNESAttachment(true)
      // Press only SELECT (bit 2 in shift register)
      snes.updateController1(SNESAttachment.BUTTON_SELECT)
      latch(snes, true)

      // bits 0 (B) and 1 (Y) should be 1 (not pressed)
      expect(snes.readPortA(0x00, 0x00) & 0x04).toBe(0x04)
      clockFalling(snes, true) // advance to bit 1 (Y)
      expect(snes.readPortA(0x00, 0x00) & 0x04).toBe(0x04)
      clockFalling(snes, true) // advance to bit 2 (SELECT)
      expect(snes.readPortA(0x00, 0x00) & 0x04).toBe(0x00) // activated
    })

    it('CLK does not advance beyond bit 15', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(0x00)
      latch(snes, true)
      // Clock 20 times — should not throw and bit index should remain at 15
      for (let i = 0; i < 20; i++) clockFalling(snes, true)
      expect(() => snes.readPortA(0x00, 0x00)).not.toThrow()
    })
  })

  describe('full 16-bit read cycle', () => {
    it('no buttons pressed — all 16 bits are 1 for both controllers', () => {
      const snes = new SNESAttachment(true)
      latch(snes, true)
      const [d1, d2] = readAllBits(snes, true)
      expect(d1).toBe(0xFFFF)
      expect(d2).toBe(0xFFFF)
    })

    it('BUTTON_B maps to bit 0 (first bit out after latch)', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_B)
      latch(snes, true)
      const [d1] = readAllBits(snes, true)
      expect(d1 & (1 << 0)).toBe(0)      // bit 0 low (B pressed)
      expect(d1 & ~(1 << 0)).toBe(0xFFFE) // all other bits high
    })

    it('BUTTON_SELECT maps to bit 2', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_SELECT)
      latch(snes, true)
      const [d1] = readAllBits(snes, true)
      expect(d1 & (1 << 2)).toBe(0)
      expect(d1 | (1 << 2)).toBe(0xFFFF)
    })

    it('BUTTON_START maps to bit 3', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_START)
      latch(snes, true)
      const [d1] = readAllBits(snes, true)
      expect(d1 & (1 << 3)).toBe(0)
    })

    it('BUTTON_UP maps to bit 4', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_UP)
      latch(snes, true)
      const [d1] = readAllBits(snes, true)
      expect(d1 & (1 << 4)).toBe(0)
    })

    it('BUTTON_DOWN maps to bit 5', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_DOWN)
      latch(snes, true)
      const [d1] = readAllBits(snes, true)
      expect(d1 & (1 << 5)).toBe(0)
    })

    it('BUTTON_LEFT maps to bit 6', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_LEFT)
      latch(snes, true)
      const [d1] = readAllBits(snes, true)
      expect(d1 & (1 << 6)).toBe(0)
    })

    it('BUTTON_RIGHT maps to bit 7', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_RIGHT)
      latch(snes, true)
      const [d1] = readAllBits(snes, true)
      expect(d1 & (1 << 7)).toBe(0)
    })

    it('BUTTON_A maps to bit 8', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_A)
      latch(snes, true)
      const [d1] = readAllBits(snes, true)
      expect(d1 & (1 << 8)).toBe(0)
    })

    it('bits 9-11 (Y, L, R) are always 1 (unmapped)', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(0xFF)
      latch(snes, true)
      const [d1] = readAllBits(snes, true)
      expect(d1 & (1 << 9)).not.toBe(0)
      expect(d1 & (1 << 10)).not.toBe(0)
      expect(d1 & (1 << 11)).not.toBe(0)
    })

    it('bits 12-15 are always 1 (controller-present ID)', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(0xFF)
      latch(snes, true)
      const [d1] = readAllBits(snes, true)
      expect(d1 & 0xF000).toBe(0xF000)
    })

    it('all mapped buttons pressed — mapped bits are 0, unmapped bits are 1', () => {
      const snes = new SNESAttachment(true)
      const all = SNESAttachment.BUTTON_B | SNESAttachment.BUTTON_SELECT |
                  SNESAttachment.BUTTON_START | SNESAttachment.BUTTON_UP |
                  SNESAttachment.BUTTON_DOWN | SNESAttachment.BUTTON_LEFT |
                  SNESAttachment.BUTTON_RIGHT | SNESAttachment.BUTTON_A
      snes.updateController1(all)
      latch(snes, true)
      const [d1] = readAllBits(snes, true)
      // Bits 0,2,3,4,5,6,7,8 should be 0
      const mappedMask = (1<<0)|(1<<2)|(1<<3)|(1<<4)|(1<<5)|(1<<6)|(1<<7)|(1<<8)
      expect(d1 & mappedMask).toBe(0)
      // Unmapped bits (1, 9-15) should all be 1
      const unmappedMask = ~mappedMask & 0xFFFF
      expect(d1 & unmappedMask).toBe(unmappedMask)
    })
  })

  describe('two independent controllers', () => {
    it('controller 1 and controller 2 are independent', () => {
      const snes = new SNESAttachment(true)
      snes.updateController1(SNESAttachment.BUTTON_B)  // controller 1: B pressed
      snes.updateController2(SNESAttachment.BUTTON_A)  // controller 2: A pressed
      latch(snes, true)
      const [d1, d2] = readAllBits(snes, true)
      expect(d1 & (1 << 0)).toBe(0)       // controller 1 bit 0 (B) low
      expect(d1 & (1 << 8)).not.toBe(0)   // controller 1 bit 8 (A) high
      expect(d2 & (1 << 8)).toBe(0)       // controller 2 bit 8 (A) low
      expect(d2 & (1 << 0)).not.toBe(0)   // controller 2 bit 0 (B) high
    })

    it('both controllers can have all buttons pressed simultaneously', () => {
      const snes = new SNESAttachment(true)
      const all = SNESAttachment.BUTTON_B | SNESAttachment.BUTTON_SELECT |
                  SNESAttachment.BUTTON_START | SNESAttachment.BUTTON_UP |
                  SNESAttachment.BUTTON_DOWN | SNESAttachment.BUTTON_LEFT |
                  SNESAttachment.BUTTON_RIGHT | SNESAttachment.BUTTON_A
      snes.updateController1(all)
      snes.updateController2(all)
      latch(snes, true)
      const [d1, d2] = readAllBits(snes, true)
      const mappedMask = (1<<0)|(1<<2)|(1<<3)|(1<<4)|(1<<5)|(1<<6)|(1<<7)|(1<<8)
      expect(d1 & mappedMask).toBe(0)
      expect(d2 & mappedMask).toBe(0)
    })
  })

  describe('Port B attachment', () => {
    it('full read cycle works correctly on Port B', () => {
      const snes = new SNESAttachment(false)
      snes.updateController1(SNESAttachment.BUTTON_UP)
      latch(snes, false)
      const [d1] = readAllBits(snes, false)
      expect(d1 & (1 << 4)).toBe(0) // UP at bit 4
    })
  })

  describe('tick and interrupts', () => {
    it('tick does not throw', () => {
      const snes = new SNESAttachment(true)
      expect(() => snes.tick(1000000)).not.toThrow()
    })

    it('clearInterrupts does not throw', () => {
      const snes = new SNESAttachment(true)
      expect(() => snes.clearInterrupts(true, true, true, true)).not.toThrow()
    })

    it('updateControlLines does not throw', () => {
      const snes = new SNESAttachment(true)
      expect(() => snes.updateControlLines(true, false, true, false)).not.toThrow()
    })
  })
})
