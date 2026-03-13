import { AttachmentBase } from './Attachment'

/**
 * SNESAttachment - Emulates two Super Nintendo controllers attached to a VIA GPIO port.
 *
 * Pin mapping (on the attached port):
 *   Bit 0 (0x01) — CLK   : clock signal driven by the 6502 (output)
 *   Bit 1 (0x02) — LATCH : latch signal driven by the 6502 (output)
 *   Bit 2 (0x04) — DATA1 : serial data from controller 1 to the 6502 (input)
 *   Bit 3 (0x08) — DATA2 : serial data from controller 2 to the 6502 (input)
 *
 * Protocol (SNES / NES shift-register protocol):
 *   1. CPU pulses LATCH high then low — controllers sample their button states
 *      and the first bit (bit 0) appears on the DATA lines.
 *   2. Each subsequent falling edge on CLK shifts to the next bit.
 *   3. A total of 16 bits are transmitted per controller (SNES).
 *
 * SNES bit order (bit 0 first):
 *   0=B  1=Y  2=SEL  3=STA  4=UP  5=DN  6=LT  7=RT
 *   8=A  9=X  10=L   11=R   12-15=1 (always high)
 *
 * All data bits are active-low (0 = button pressed, 1 = not pressed).
 *
 * Button state format matches the constants used in index.ts / JoystickAttachment:
 *   BUTTON_UP=0x01  BUTTON_DOWN=0x02  BUTTON_LEFT=0x04   BUTTON_RIGHT=0x08
 *   BUTTON_A=0x10   BUTTON_B=0x20     BUTTON_SELECT=0x40  BUTTON_START=0x80
 */
export class SNESAttachment extends AttachmentBase {
  // Button bit masks — identical to the constants in index.ts
  static readonly BUTTON_UP     = 0x01
  static readonly BUTTON_DOWN   = 0x02
  static readonly BUTTON_LEFT   = 0x04
  static readonly BUTTON_RIGHT  = 0x08
  static readonly BUTTON_A      = 0x10
  static readonly BUTTON_B      = 0x20
  static readonly BUTTON_SELECT = 0x40
  static readonly BUTTON_START  = 0x80

  // Pin masks within the VIA port
  private static readonly PIN_CLK   = 0x01  // bit 0 — driven by CPU
  private static readonly PIN_LATCH = 0x02  // bit 1 — driven by CPU
  private static readonly PIN_DATA1 = 0x04  // bit 2 — read by CPU (controller 1)
  private static readonly PIN_DATA2 = 0x08  // bit 3 — read by CPU (controller 2)

  // Total number of bits shifted out per SNES controller read cycle
  private static readonly SNES_BITS = 16

  private readonly attachedToPortA: boolean

  // Raw button states (1-bit-per-button, BUTTON_x masks, as received from the host)
  private buttonState1: number = 0x00
  private buttonState2: number = 0x00

  // 16-bit SNES shift registers (active-low: 0=pressed, 1=not pressed)
  private shiftReg1: number = 0xFFFF
  private shiftReg2: number = 0xFFFF

  // Index of the bit currently presented on DATA (0..15)
  private bitIndex: number = 0

  // Previous signal levels used to detect rising/falling edges
  private prevLatch: boolean = false
  private prevClk: boolean   = false

  /**
   * @param attachToPortA - true to respond on Port A, false for Port B
   * @param priority      - attachment priority (lower = higher priority)
   */
  constructor(attachToPortA: boolean = true, priority: number = 0) {
    super(priority, false, false, false, false)
    this.attachedToPortA = attachToPortA
  }

  reset(): void {
    super.reset()
    this.buttonState1 = 0x00
    this.buttonState2 = 0x00
    this.shiftReg1    = 0xFFFF
    this.shiftReg2    = 0xFFFF
    this.bitIndex     = 0
    this.prevLatch    = false
    this.prevClk      = false
  }

  // ---------------------------------------------------------------------------
  // Port reads — supply DATA1 / DATA2 bits to the VIA for the CPU to read
  // ---------------------------------------------------------------------------

  readPortA(ddr: number, or: number): number {
    return this.attachedToPortA ? this.currentDataBits() : 0xFF
  }

  readPortB(ddr: number, or: number): number {
    return this.attachedToPortA ? 0xFF : this.currentDataBits()
  }

  // ---------------------------------------------------------------------------
  // Port writes — monitor CLK and LATCH transitions driven by the CPU
  // ---------------------------------------------------------------------------

  writePortA(value: number, ddr: number): void {
    if (this.attachedToPortA) {
      this.handleSignals(value)
    }
  }

  writePortB(value: number, ddr: number): void {
    if (!this.attachedToPortA) {
      this.handleSignals(value)
    }
  }

  // ---------------------------------------------------------------------------
  // Controller state update API
  // ---------------------------------------------------------------------------

  /**
   * Update the button state for controller 1 (DATA1 line).
   * @param buttons - Button state byte using BUTTON_x bit masks (1 = pressed)
   */
  updateController1(buttons: number): void {
    this.buttonState1 = buttons & 0xFF
  }

  /**
   * Update the button state for controller 2 (DATA2 line).
   * @param buttons - Button state byte using BUTTON_x bit masks (1 = pressed)
   */
  updateController2(buttons: number): void {
    this.buttonState2 = buttons & 0xFF
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a 16-bit SNES shift register from a button-state byte.
   * Bits are active-low (0 = pressed, 1 = not pressed).
   * Bits 12-15 are always 1 (used by the protocol to identify controller type).
   * Y (bit 1), X (bit 9), L (bit 10), R (bit 11) have no mapping and stay 1.
   */
  private buildShiftRegister(buttons: number): number {
    let data = 0xFFFF  // start with all 1s (no buttons pressed)

    if (buttons & SNESAttachment.BUTTON_B)      data &= ~(1 <<  0)  // B
    // bit 1 = Y — unmapped, stays 1
    if (buttons & SNESAttachment.BUTTON_SELECT) data &= ~(1 <<  2)  // SELECT
    if (buttons & SNESAttachment.BUTTON_START)  data &= ~(1 <<  3)  // START
    if (buttons & SNESAttachment.BUTTON_UP)     data &= ~(1 <<  4)  // UP
    if (buttons & SNESAttachment.BUTTON_DOWN)   data &= ~(1 <<  5)  // DOWN
    if (buttons & SNESAttachment.BUTTON_LEFT)   data &= ~(1 <<  6)  // LEFT
    if (buttons & SNESAttachment.BUTTON_RIGHT)  data &= ~(1 <<  7)  // RIGHT
    if (buttons & SNESAttachment.BUTTON_A)      data &= ~(1 <<  8)  // A
    // bits 9=X, 10=L, 11=R — unmapped, stay 1
    // bits 12-15 — always 1 (controller present / protocol identification)

    return data & 0xFFFF
  }

  /**
   * Detect LATCH / CLK signal transitions and update internal state accordingly.
   */
  private handleSignals(value: number): void {
    const latch = (value & SNESAttachment.PIN_LATCH) !== 0
    const clk   = (value & SNESAttachment.PIN_CLK)   !== 0

    // LATCH rising edge: capture current button states and reset the bit counter
    if (latch && !this.prevLatch) {
      this.shiftReg1 = this.buildShiftRegister(this.buttonState1)
      this.shiftReg2 = this.buildShiftRegister(this.buttonState2)
      this.bitIndex  = 0
    }

    // CLK falling edge: advance to the next bit
    if (!clk && this.prevClk) {
      if (this.bitIndex < SNESAttachment.SNES_BITS - 1) {
        this.bitIndex++
      }
    }

    this.prevLatch = latch
    this.prevClk   = clk
  }

  /**
   * Return the port byte with DATA1 and DATA2 reflecting the current shift-register bit.
   * All other bits (CLK, LATCH, and unused bits 4-7) are returned as 1.
   */
  private currentDataBits(): number {
    const bit1 = (this.shiftReg1 >> this.bitIndex) & 1
    const bit2 = (this.shiftReg2 >> this.bitIndex) & 1

    let result = 0xFF
    if (bit1 === 0) result &= ~SNESAttachment.PIN_DATA1
    if (bit2 === 0) result &= ~SNESAttachment.PIN_DATA2

    return result
  }
}
