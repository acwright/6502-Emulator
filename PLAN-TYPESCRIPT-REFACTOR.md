# TypeScript Emulator Refactor Plan

**Project**: `/Users/acwright/Developer/NodeJS/6502-EMULATOR/`
**Goal**: Align the TypeScript 6502 emulator with the C++ firmware emulator for behavioral consistency and accuracy. Where differences exist, favor the implementation that is more faithful to the real hardware specifications.

---

## 1. CPU: Add BCD (Decimal) Mode to ADC and SBC

**File**: `src/components/CPU.ts`
**Priority**: HIGH — BCD mode is required by the 65C02 specification and many programs depend on it.

### ADC Changes

The current `ADC()` method ignores the D (Decimal) flag entirely. It must be updated to handle BCD arithmetic when the D flag is set.

**Current behavior**: Binary-only addition regardless of D flag.

**Required behavior** (per WDC 65C02 datasheet):
- When D flag is set, treat A and the operand as BCD (two packed BCD digits: 0x00–0x99).
- Perform BCD addition with carry.
- Set C flag if BCD result exceeds 99 (decimal carry).
- Set Z flag based on the **binary** result (this is the 65C02 behavior; the original 6502 had undefined Z/N in decimal mode, but the 65C02 corrects this).
- Set N flag based on the **binary** result.
- Set V flag based on the **binary** result (V is technically undefined in decimal mode on NMOS 6502, but defined on 65C02).
- Store the BCD-corrected result in A.

**Reference implementation** (from vrEmu6502.c, the C++ emulator's CPU core):
```c
// BCD decimal mode ADC
static void adcd(VrEmu6502 *vr6502, uint16_t modeAddr) {
    uint8_t oper = readMem(vr6502, modeAddr);
    uint8_t c = vr6502->flags.c;

    // Binary computation for flag setting
    uint16_t bin = (uint16_t)vr6502->ac + oper + c;

    // BCD computation
    int lo = (vr6502->ac & 0x0f) + (oper & 0x0f) + c;
    if (lo > 0x09) lo += 0x06;
    int hi = (vr6502->ac >> 4) + (oper >> 4) + (lo > 0x0f);
    if (hi > 0x09) hi += 0x06;

    uint8_t result = (hi << 4) | (lo & 0x0f);

    // Flags from binary result
    vr6502->flags.z = (bin & 0xff) == 0;
    vr6502->flags.v = ((vr6502->ac ^ bin) & (oper ^ bin) & 0x80) != 0;
    vr6502->flags.n = (bin & 0x80) != 0;
    vr6502->flags.c = hi > 0x0f;

    vr6502->ac = result;
}
```

### SBC Changes

The current `SBC()` method also ignores the D flag. Same approach needed.

**Reference implementation** (from vrEmu6502.c):
```c
// BCD decimal mode SBC
static void sbcd(VrEmu6502 *vr6502, uint16_t modeAddr) {
    uint8_t oper = readMem(vr6502, modeAddr);
    uint8_t c = vr6502->flags.c;

    // Binary computation for flag setting
    uint16_t bin = (uint16_t)vr6502->ac - oper - !c;

    // BCD computation
    int lo = (vr6502->ac & 0x0f) - (oper & 0x0f) - !c;
    if (lo < 0) lo = ((lo - 0x06) & 0x0f) | ((vr6502->ac & 0xf0) - (oper & 0xf0) - 0x10);
    else lo = (lo & 0x0f) | ((vr6502->ac & 0xf0) - (oper & 0xf0));
    if (lo < 0) lo -= 0x60;

    uint8_t result = lo & 0xff;

    // Flags from binary result
    vr6502->flags.z = (bin & 0xff) == 0;
    vr6502->flags.v = ((vr6502->ac ^ bin) & (~oper ^ bin) & 0x80) != 0;
    vr6502->flags.n = (bin & 0x80) != 0;
    vr6502->flags.c = bin < 0x100;

    vr6502->ac = result;
}
```

### Implementation approach

In both `ADC()` and `SBC()`, check `this.getFlag(CPU.D)` at the top. If set, branch into a BCD code path. If clear, keep the existing binary code path unchanged.

---

## 2. CPU: Fix BIT Immediate (Opcode 0x89)

**File**: `src/components/CPU.ts`
**Priority**: HIGH — Incorrect flag behavior.

**Current behavior**: The single `BIT()` method unconditionally sets N and V flags from the fetched operand for all addressing modes, including immediate.

**Required behavior** (per WDC 65C02 datasheet): BIT #imm (opcode 0x89) should **only** set the Z flag. It must NOT modify N or V.

**Fix**: Either:
- (a) Create a separate `BIT_IMM()` method that only sets Z, and wire opcode 0x89 to use it, OR
- (b) Track the current addressing mode and skip N/V flag setting when the mode is IMM.

Option (a) is simplest:

```typescript
private BIT_IMM(): number {
    this.fetch()
    this.temp = this.a & this.fetched
    this.setFlag(CPU.Z, (this.temp & 0x00FF) == 0x00)
    // N and V are NOT modified for BIT immediate
    return 0
}
```

Update the opcode table entry for 0x89 to use `this.BIT_IMM.bind(this)` instead of `this.BIT.bind(this)`.

---

## 3. CPU: Fix Branch Instruction Cycle Counting

**File**: `src/components/CPU.ts`
**Priority**: MEDIUM — Timing inaccuracy affecting cycle-counted code.

**Current behavior**: Standard branch instructions (BCC, BCS, BEQ, BNE, BMI, BPL, BVC, BVS) add extra cycles (for taken branch, page crossing) to `this.cycles` (total counter). However, the 65C02-specific BRA instruction and BBR/BBS instructions add them to `this.cyclesRem` instead. This inconsistency means standard branches don't actually delay execution properly.

**Required behavior**: When a branch is taken, the extra cycle(s) should be added to `this.cyclesRem` so that the CPU actually stalls for the correct number of cycles. This is how BRA and BBR/BBS already work.

**Fix**: In all 8 standard branch methods (BCC, BCS, BEQ, BNE, BMI, BPL, BVC, BVS), change `this.cycles++` to `this.cyclesRem++`.

Example for BCC:
```typescript
// Before:
this.cycles++
// After:
this.cyclesRem++
```

Apply this to all 8 standard branch instructions.

---

## 4. IRQ Model: Change from Edge-Triggered to Level-Triggered

**File**: `src/components/Machine.ts`, `src/components/CPU.ts`
**Priority**: MEDIUM — Affects interrupt-driven software behavior.

**Current behavior**: Each IO device has a `raiseIRQ` callback that directly calls `cpu.irq()`. This is edge-triggered — each event fires the IRQ handler once. If the I flag is set when the IRQ fires, the interrupt is lost.

**Required behavior** (matching C++ and real 6522/R6551/TMS9918 hardware): Interrupts should be level-triggered. The IRQ line is OR'd across all devices each cycle. If any device is asserting IRQ, the CPU sees it. When the CPU clears the I flag (via RTI or CLI), it will service the interrupt if the line is still asserted.

### Changes needed:

**CPU.ts**: Add an IRQ line state:
```typescript
private irqLine: boolean = false

irqTrigger(): void {
    this.irqLine = true
}

irqClear(): void {
    this.irqLine = false
}
```

In the CPU's tick/cycle execution, check `irqLine` at the appropriate point (after instruction completion) and call the existing IRQ handler if `irqLine` is true and I flag is clear.

**Machine.ts**: Replace the direct `raiseIRQ` callback pattern. Instead, after all IO devices are ticked, OR their return values together. If any returned a non-zero IRQ indicator, call `cpu.irqTrigger()`. Otherwise call `cpu.irqClear()`.

This matches the C++ pattern:
```cpp
interrupt |= serialCard.tick(cachedCpuFrequency);
interrupt |= gpioCard.tick(cachedCpuFrequency);
// ...
if (interrupt & 0x80) {
    cpu.irqTrigger();
} else {
    cpu.irqClear();
}
```

### IO device changes

Each IO device's `tick()` method should **return** an interrupt status byte instead of calling `raiseIRQ()`. Bit 7 (0x80) = IRQ, Bit 6 (0x40) = NMI. Remove the `raiseIRQ` callback property from all IO device classes. The VIA, ACIA, Video, and RTC classes all need this change.

---

## 5. IO Tick Batching: Tick All IO Every CPU Cycle

**File**: `src/components/Machine.ts`
**Priority**: MEDIUM — Affects timer accuracy and interrupt responsiveness.

**Current behavior**: Only ACIA is ticked every cycle. All other IO devices (RTC, Storage, VIA, Sound, Video) are ticked every 128 cycles with the batch count passed as a parameter.

**Required behavior**: All IO devices should be ticked every CPU cycle, matching the C++ implementation. This is important for VIA timer accuracy and Video vblank timing.

### Changes needed:

1. Remove `ioCycleAccumulator` and `ioTickInterval` fields.
2. Tick all IO devices every cycle (remove the `if (ioCycleAccumulator >= ioTickInterval)` batching).
3. Update IO device `tick()` signatures to remove the optional `cycles` parameter if they use it for batch processing.
4. Ensure Sound and Video `tick()` methods work correctly when called per-cycle instead of in batches. If they currently accumulate 128 cycles of work in a single tick call, refactor them to do 1 cycle of work per tick.

**Note**: RAMBank IO slots (IO1, IO2) do not need ticking — both C++ and TS agree on this.

---

## 6. ACIA: Simplify to Match R6551 Hardware (No Buffers, No Baud Timing)

**File**: `src/components/IO/ACIA.ts`
**Priority**: MEDIUM — Current implementation over-simulates features the real hardware doesn't have.

**Current behavior**: Multi-byte transmit and receive buffers, baud-rate cycle counting, complex drain timing.

**Required behavior**: The real R6551 has **no** TX or RX buffers — it has single-byte TX and RX registers. Since both emulators use USB serial (operating at USB speeds), baud rate timing is unnecessary.

### Changes needed:

1. **Remove `transmitBuffer` and `receiveBuffer` arrays.** Replace with single-byte `tx` and `rx` registers (matching C++).
2. **Remove baud rate timing logic.** No `cycleCounter`, no `cyclesPerByte` calculations.
3. **TX behavior**: When CPU writes to register 0, store in `tx`, clear TX_REG_EMPTY in status, set `txPending = true`. In `tick()`, if `txPending`, send the byte immediately, set TX_REG_EMPTY, clear `txPending`. Fire TX interrupt if TIC bits are configured for it.
4. **RX behavior**: In `tick()`, check if serial data is available. If so and RX_REG_FULL is already set, set OVERRUN flag. Otherwise store in `rx`, set RX_REG_FULL, fire RX interrupt if enabled.
5. **Keep** the R6551 register interface (4 registers), command register bits (DTR, IRD, TIC, REM, PME, PMC), status register bits, and programmed reset behavior.
6. **Remove** the `raiseIRQ` callback — tick should return interrupt status byte (0x80 for IRQ) as part of the level-triggered IRQ refactor (item 4 above).

Reference: The C++ `SerialCard` implementation is the target behavior model.

---

## 7. RAMBank: Fix $3FF Read/Write Behavior

**File**: `src/components/IO/RAMBank.ts`
**Priority**: MEDIUM — Behavioral difference in bank register access.

**Current behavior**: Reading address $3FF returns `currentBank` directly (not from RAM). Writing to $3FF sets `currentBank` but does NOT write the value into the RAM data array.

**Required behavior** (matching C++ and real hardware): Writing to $3FF sets `currentBank` AND writes the value into the RAM data array at the current bank offset. Reading $3FF reads from the RAM data array (which will naturally contain the bank number, since that's what was written there).

### Changes needed:

**Write**: When `address === 0x3FF`, set `currentBank = value` first, THEN write through to `data[currentBank * BANK_SIZE + address] = value` (note: after setting the bank, you write into the NEW bank's $3FF location — this matches the C++ behavior where the bank is set before the index is computed).

**Read**: Remove the special case for `address === 0x3FF`. All reads, including $3FF, should go through `data[currentBank * BANK_SIZE + address]`.

Reference (C++ RAMCard):
```cpp
void RAMCard::write(uint16_t address, uint8_t value) {
    if (address == 0x03FF) {
        this->bank = value;
    }
    uint32_t index = (this->bank << 0xA) | address;
    this->data[index] = value;
}

uint8_t RAMCard::read(uint16_t address) {
    uint32_t index = (this->bank << 0xA) | address;
    return this->data[index];
}
```

---

## 8. Keyboard Encoder: Default to Port B Only

**File**: `src/components/IO/Attachments/KeyboardEncoderAttachment.ts`
**Priority**: LOW — Behavioral alignment.

**Current behavior**: `activePort` defaults to `'both'`, routing keyboard events to both Port A and Port B simultaneously.

**Required behavior**: Default should be `'B'` (Port B only), matching the C++ emulator where keyboard events go to Port B. Keep the `activePort` property and the ability to set it to `'A'`, `'B'`, or `'both'` — just change the default.

### Change:

```typescript
// Before:
activePort: 'A' | 'B' | 'both' = 'both'
// After:
activePort: 'A' | 'B' | 'both' = 'B'
```

---

## 9. Sound & Video: Ensure 6502-Facing Register Behavior Is Consistent

**Files**: `src/components/IO/Sound.ts`, `src/components/IO/Video.ts`
**Priority**: LOW — Verify alignment, no major changes expected.

The TypeScript Sound and Video implementations include full synthesis/rendering that the C++ version offloads to a web application. This is fine. However, verify that from the 6502's perspective (register reads and writes), the behavior is consistent:

### Sound (SID)
- **Write**: Both implementations store to `registers[address & 0x1F]`. TS does additional voice/filter state updates for synthesis — this is fine, it doesn't change the 6502-visible behavior.
- **Read**: Both return values only for registers $19–$1C (POTX, POTY, OSC3, ENV3) and return 0 for all others. The TS version returns live oscillator/envelope values for $1B/$1C while C++ returns the stored register value. This difference is acceptable since the C++ offloads synthesis — the TS version is actually more accurate here.
- **No changes required** unless testing reveals a specific discrepancy.

### Video (TMS9918A)
- **Read/Write**: Both use the same two-port interface (data port at even address, control/status at odd address) with identical two-stage latch protocol. Both auto-increment VRAM address. Both handle read-ahead buffer correctly. Both handle vblank interrupt generation via register 1 bit 5.
- **No changes required** unless testing reveals a specific discrepancy.

---

## Summary / Execution Order

| # | Task | Priority | File(s) |
|---|------|----------|---------|
| 1 | Add BCD mode to ADC/SBC | HIGH | CPU.ts |
| 2 | Fix BIT #imm (0x89) | HIGH | CPU.ts |
| 3 | Fix branch cycle counting | MEDIUM | CPU.ts |
| 4 | Level-triggered IRQ model | MEDIUM | Machine.ts, CPU.ts, all IO |
| 5 | Remove IO tick batching | MEDIUM | Machine.ts, Sound.ts, Video.ts |
| 6 | Simplify ACIA (no buffers) | MEDIUM | ACIA.ts |
| 7 | Fix RAMBank $3FF behavior | MEDIUM | RAMBank.ts |
| 8 | Keyboard default to Port B | LOW | KeyboardEncoderAttachment.ts |
| 9 | Verify Sound/Video registers | LOW | Sound.ts, Video.ts |

Recommended order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Items 1–3 are isolated CPU changes. Item 4 is an architectural change that touches multiple files. Items 5–7 are independent IO changes. Items 8–9 are small tweaks.
