function DasmRecord() {
    this.addr = 0; // instruction begin address
    this.bytes = []; // instruction binary opcode and operands
    this.mn = ''; // instruction mnemonics (general representation)
    this.operands = {
        addr: undefined, // target address
        offs: undefined, // relative offset
        val8: undefined, // byte operand value
        val16: undefined, // word operand value
        port: undefined // io port value
    };
}
DasmRecord.prototype = {
    // returns next instruction begin address
    get_next: function () {
        return (this.addr + this.bytes.length) & 0xFFFF;
    },

    get_fullMnemonics: function () {
        return this.mn.replace(/(addr|val16)|(val8|port)|(?:\+\s*offs)/gi, function (m, val16, val8, offs) {
            var operands = this.operands;
            if (val16)
                return DebugUtils.wordToString(operands[val16]);
            if (val8)
                return DebugUtils.byteToString(operands[val8]);
            var offset = operands.offs;
            if (offset & 0x80) { 
                offset = -((offset ^ 0xff) + 1);
            }
            return (offset >= 0 ? '+ ' : '- ')  + DebugUtils.byteToString(Math.abs(offset));
        }.bind(this));
    },

    equals: function (another) {
        if (!another || another.bytes.length != this.bytes.length)
            return false;
        for ( var i = 0; i < this.bytes.length; i++ ) {
            if (this.bytes[i] != another.bytes[i])
                return false;
        }
        return true;
    }
};

DasmRecord.createInstructionReader = function (bus, address) {
    return {
        next: address,
        readByte: function() {
            var value = bus.instruction_read(this.next);
            this.next = (this.next + 1) & 0xFFFF;
            return value;
        },
        readWord: function() {
            var value = this.readByte() | (this.readByte() << 8);
            return value;
        }
    };
}

DasmRecord.read = function (bus, address) {
    var result = new DasmRecord();
    result.addr = address;
    var opcodeReader = DasmRecord.createInstructionReader(bus, address);
    var opcode = opcodeReader.readByte();
    result.bytes.push(opcode);

    var prefix_ix = ( opcode == 0xdd );
    var prefix_iy = ( opcode == 0xfd );
    var prefix_ed = ( opcode == 0xed );
    var prefix_cb = ( opcode == 0xcb );
    var offset = 0;

    if ( prefix_ix || prefix_iy ) {
        opcode = opcodeReader.readByte();
        if ( opcode == 0xdd || opcode == 0xfd || opcode == 0xed ) {
            result.mn = 'NOP';
            return result;
        }
        result.bytes.push(opcode);

        if ( opcode == 0xcb ) {
            prefix_cb = true;
            offset = opcodeReader.readByte();
            result.bytes.push(offset);
        }
    }

    if ( prefix_ed ) {
        opcode = opcodeReader.readByte();
        result.bytes.push(opcode);

        // 010xx111
        if ( ( opcode & 0xe7 ) == 0x47 ) {
            // LD A, I
            // LD A, R
            // LD I, A
            // LD R, A
            var subcode = (opcode >> 3) & 0x03;
            switch (subcode) {
                case 0x00: result.mn = 'LD I, A'; break;
                case 0x01: result.mn = 'LD R, A'; break;
                case 0x02: result.mn = 'LD A, I'; break;
                case 0x03: result.mn = 'LD A, R'; break;
            }

            return result;
        }

        // 01xxx011
        if ( (opcode & 0xc7 ) == 0x43 ) {
            // LD dd, (nn)
            // LD (nn), dd

            var to_reg = !!(opcode & 0x08);
            var dd = (opcode >> 4) & 0x03;

            var reg_name;
            switch (dd) {
                case 0x00: reg_name = 'BC'; break;
                case 0x01: reg_name = 'DE'; break;
                case 0x02: reg_name = 'HL'; break;
                case 0x03: reg_name = 'SP'; break;
            }

            if (to_reg) {
                result.mn = 'LD ' + reg_name + ', (addr)';
            }
            else { // to_mem
                result.mn = 'LD (addr), ' + reg_name;
            }

            var targetAddr = opcodeReader.readWord();
            result.bytes.push(targetAddr & 0xff, targetAddr >> 8);
            result.operands.addr = targetAddr

            return result;
        }

        // 101xx000
        if ( (opcode & 0xe7 ) == 0xa0 ) {
            // LDI
            // LDIR
            // LDD
            // LDDR

            var increment = !(opcode & 0x08);
            var repeat = !!(opcode & 0x10);

            result.mn = 'LD' + ( increment ? 'I' : 'D' ) + ( repeat ? 'R' : '' );
            return result;
        }

        // 101xx001
        if ( (opcode & 0xe7 ) == 0xa1 ) {
            // CPI
            // CPIR
            // CPD
            // CPDR

            var increment = !(opcode & 0x08);
            var repeat = !!(opcode & 0x10);

            result.mn = 'CP' + ( increment ? 'I' : 'D' ) + ( repeat ? 'R' : '' );
            return result;
        }

        // 01xxx100
        if (( opcode & 0xc7 ) == 0x44 ) {
            // NEG
            // * включая все недокументированные варианты опкодов

            result.mn = 'NEG';
            return result;
        }

        // 01xxx110
        if ( ( opcode & 0xc7 ) == 0x46 ) {
            // IM 0
            // IM 1
            // IM 2
            // * включая все недокументированные варианты опкодов

            switch (( opcode >> 3 ) & 0x03 ) {
                case 0x00: result.mn = 'IM 0'; break;
                case 0x01: result.mn = 'IM 0'; break;
                case 0x02: result.mn = 'IM 1'; break;
                case 0x03: result.mn = 'IM 2'; break;
            }

            return result;
        }

        // 01xxx010
        if ( (opcode & 0xc7 ) == 0x42 ) {
            // ADC HL, ss
            // SBC HL, ss

            var addition = !!(opcode & 0x08);
            var ss = (opcode >> 4) & 0x03;

            var reg_name;
            switch (ss) {
                case 0x00: reg_name = 'BC'; break;
                case 0x01: reg_name = 'DE'; break;
                case 0x02: reg_name = 'HL'; break;
                case 0x03: reg_name = 'SP'; break;
            }

            result.mn = ( addition ? 'ADC HL, ' : 'SBC HL, ') + reg_name;
            return result;
        }

        // 0110x111
        if ( (opcode & 0xf7 ) == 0x67 ) {
            // RLD
            // RRD

            var left = !!(opcode & 0x08);

            result.mn = left ? 'RLD' : 'RRD';
            return result;
        }

        // 01xxx101
        if ( (opcode & 0xc7 ) == 0x45 ) {
            // RETI
            // RETN
            // * включая все недокументированные варианты опкодов

            result.mn = 'RET' + (( opcode & 0x80 ) ? 'I' : 'N' );
            return result;
        }

        // 01xxx00x
        if ( ( opcode & 0xc6 ) == 0x40 ) {
            // IN r, (C)
            // OUT (C), r
            // * IN 0, (C)
            // * OUT (C), 0

            var r1 = (opcode >> 3) & 0x07;
            var cmd_in = !(opcode & 0x01);

            var reg_name;
            switch (r1) {
                case 0x00: reg_name = 'B'; break;
                case 0x01: reg_name = 'C'; break;
                case 0x02: reg_name = 'D'; break;
                case 0x03: reg_name = 'E'; break;
                case 0x04: reg_name = 'H'; break;
                case 0x05: reg_name = 'L'; break;
                case 0x06: reg_name = '0'; break;
                case 0x07: reg_name = 'A'; break;
            }

            if (cmd_in) {
                result.mn = 'IN ' + reg_name + ', (C)';
            }
            else {
                result.mn = 'OUT (C), ' + reg_name;
            }

            return result;
        }

        // 101xx01x
        if ( (opcode & 0xe6 ) == 0xa2 ) {
            // INI
            // INIR
            // IND
            // INDR
            // OUTI
            // OTIR
            // OUTD
            // OTDR

            var repeat = !!(opcode & 0x10);
            var increment = !(opcode & 0x08);
            var cmd_in = !(opcode & 0x01);

            if (cmd_in) {
                result.mn = 'IN' + ( increment ? 'I' : 'D' ) + ( repeat ? 'R' : '' );
            }
            else {
                result.mn = ( repeat ? 'OT' : 'OUT' ) + ( increment ? 'I' : 'D' ) + ( repeat ? 'R' : '' );
            }

            return result;
        }

        result.mn = 'NOP';
        return result;
    }

    if ( prefix_cb ) {
        opcode = opcodeReader.readByte();
        result.bytes.push(opcode);

        // 00xxxxxx
        if ( (opcode & 0xc0 ) == 0x00 ) {
            // RLC r
            // RLC (HL)
            // RLC (IX + d)
            // RLC (IY + d)
            // * RLC (IY + d), r
            // RL r
            // RL (HL)
            // RL (IX + d)
            // RL (IY + d)
            // * RL (IY + d), r
            // RRC r
            // RRC (HL)
            // RRC (IX + d)
            // RRC (IY + d)
            // * RRC (IY + d), r
            // RR r
            // RR (HL)
            // RR (IX + d)
            // RR (IY + d)
            // * RR (IY + d), r
            // SLA r
            // SLA (HL)
            // SLA (IX + d)
            // SLA (IY + d)
            // * SLA (IY + d), r
            // * SLL r
            // * SLL (HL)
            // * SLL (IX + d)
            // * SLL (IY + d)                
            // * SLL (IY + d), r
            // SRA r
            // SRA (HL)
            // SRA (IX + d)
            // SRA (IY + d)
            // * SRA (IY + d), r
            // SRL r
            // SRL (HL)
            // SRL (IX + d)
            // SRL (IY + d)
            // * SRL (IY + d), r

            var cmd_shift = !!(opcode & 0x20);
            var left = !(opcode & 0x08);
            var carry = !(opcode & 0x10);
            var r1 = opcode & 0x07;

            var reg_name;
            switch (r1) {
                case 0x00: reg_name = 'B'; break;
                case 0x01: reg_name = 'C'; break;
                case 0x02: reg_name = 'D'; break;
                case 0x03: reg_name = 'E'; break;
                case 0x04: reg_name = 'H'; break;
                case 0x05: reg_name = 'L'; break;
                case 0x06: reg_name = '(HL)'; break;
                case 0x07: reg_name = 'A'; break;
            }

            result.mn = ( cmd_shift ? 'S' : 'R' ) + ( left ? 'L' : 'R' );
            if ( !cmd_shift & carry ) {
                result.mn  += 'C';
            }

            if ( cmd_shift ) {
                result.mn  += ( carry ? 'A' : 'L' );
            }

            result.mn += ' ';

            if ( prefix_ix ) {
                result.mn  += '(IX + offs)';
                result.operands.offs = offset;
            }
            else if ( prefix_iy ) {
                result.mn  += '(IY + offs)';
                result.operands.offs = offset;
            }
            else {
                result.mn  += reg_name;
            }

            if (( prefix_ix || prefix_iy ) && r1 != 0x06 ) {
                result.mn  += ', ' + reg_name;
            }

            return result;
        }

        // 01xxxxxx
        if ( (opcode & 0xc0 ) == 0x40 ) {
            // BIT b, r
            // BIT b, (HL)
            // BIT b, (IX + d)
            // BIT b, (IY + d)

            var r_dst = opcode & 0x07;
            var bit = (opcode >> 3) & 0x07;

            var reg_name;
            switch (r_dst) {
                case 0x00: reg_name = 'B'; break;
                case 0x01: reg_name = 'C'; break;
                case 0x02: reg_name = 'D'; break;
                case 0x03: reg_name = 'E'; break;
                case 0x04: reg_name = 'H'; break;
                case 0x05: reg_name = 'L'; break;
                case 0x06: reg_name = '(HL)'; break;
                case 0x07: reg_name = 'A'; break;
            }

            result.mn = 'BIT ' + bit + ', ';

            if (prefix_ix) {
                result.mn += '(IX + offs)';
                result.operands.offs = offset;
            }
            else if (prefix_iy) {
                result.mn += '(IY + offs)';
                result.operands.offs = offset;
            }
            else {
                result.mn += reg_name;
            }

            if (( prefix_ix || prefix_iy ) && r_dst != 0x06 ) {
                result.mn  += ', ' + reg_name;
            }

            return result;
        }

        // 1xxxxxxx
        if ( (opcode & 0x80 ) == 0x80 ) {
            // SET b, r
            // SET b, (HL)
            // SET b, (IX + d)
            // SET b, (IY + d)
            // * SET b, (IX + d), r
            // * SET b, (IY + d), r
            // RES b, r
            // RES b, (HL)
            // RES b, (IX + d)
            // RES b, (IY + d)
            // * RES b, (IX + d), r
            // * RES b, (IY + d), r

            var r_dst = opcode & 0x07;
            var bit = (opcode >> 3) & 0x07;
            var cmd_set = !!(opcode & 0x40);

            var reg_name;
            switch (r_dst) {
                case 0x00: reg_name = 'B'; break;
                case 0x01: reg_name = 'C'; break;
                case 0x02: reg_name = 'D'; break;
                case 0x03: reg_name = 'E'; break;
                case 0x04: reg_name = 'H'; break;
                case 0x05: reg_name = 'L'; break;
                case 0x06: reg_name = '(HL)'; break;
                case 0x07: reg_name = 'A'; break;
            }

            result.mn = ( cmd_set ? 'SET ' : 'RES ' ) + bit + ', ';

            if (prefix_ix) {
                result.mn += '(IX + offs)';
                result.operands.offs = offset;
            }
            else if (prefix_iy) {
                result.mn += '(IY + offs)';
                result.operands.offs = offset;
            }
            else {
                result.mn += reg_name;
            }

            if (( prefix_ix || prefix_iy ) && r_dst != 0x06 ) {
                result.mn  += ', ' + reg_name;
            }

            return result;
        }

        result.mn = 'NOP';
        return result;
    }

    if ( opcode == 0x00 ) {
        result.mn = 'NOP';
        return result;
    }

    // 01xxxxxx
    if ( ( opcode & 0xc0 ) == 0x40 ) {
        // LD r, r'
        // LD r, (HL)
        // LD (HL), r
        // LD r, (IX + d)
        // LD r, (IY + d)
        // LD (IX + d), r
        // LD (IY + d), r
        // HALT
        // + недокументированные

        var r_dst = (opcode >> 3) & 0x07;
        var r_src = opcode & 0x07;    

        if (r_src == 0x06 && r_dst == 0x06) {
            // HALT
            result.mn = 'HALT';
            return result;
        }

        var r_src_name;
        switch (r_src) {
            case 0x00: r_src_name = 'B'; break;
            case 0x01: r_src_name = 'C'; break;
            case 0x02: r_src_name = 'D'; break;
            case 0x03: r_src_name = 'E'; break;
            case 0x04: 
                if (prefix_ix && r_dst != 0x06) {
                    r_src_name = 'IX&h';
                }
                else if (prefix_iy && r_dst != 0x06) {
                    r_src_name = 'IY&h';
                }
                else {
                    r_src_name = 'H'; 
                }
                break;

            case 0x05: 
                if (prefix_ix && r_dst != 0x06) {
                    r_src_name = 'IX&l';
                }
                else if (prefix_iy && r_dst != 0x06) {
                    r_src_name = 'IY&l';
                }
                else {
                    r_src_name = 'L'; 
                }
                break;

            case 0x06:
                var addr;
                if (prefix_ix) {
                    var offset = opcodeReader.readByte();
                    result.operands.offs = offset;
                    result.bytes.push(offset);
                    r_src_name = '(IX + offs)';
                }
                else if (prefix_iy) {
                    var offset = opcodeReader.readByte();
                    result.operands.offs = offset;
                    result.bytes.push(offset);
                    r_src_name = '(IY + offs)';
                }
                else {
                    r_src_name = '(HL)';
                }
                break;

            case 0x07: r_src_name = 'A'; break;
        }

        var r_dst_name;
        switch (r_dst) {
            case 0x00: r_dst_name = 'B'; break;
            case 0x01: r_dst_name = 'C'; break;
            case 0x02: r_dst_name = 'D'; break;
            case 0x03: r_dst_name = 'E'; break;
            case 0x04: 
                if (prefix_ix && r_src != 0x06) {
                    r_dst_name = 'IX&h';
                }
                else if (prefix_iy && r_src != 0x06) {
                    r_dst_name = 'IY&h';
                }
                else {
                    r_dst_name = 'H'; 
                }
                break;

            case 0x05: 
                if (prefix_ix && r_src != 0x06) {
                    r_dst_name = 'IX&l';
                }
                else if (prefix_iy && r_src != 0x06) {
                    r_dst_name = 'IY&l';
                }
                else {
                    r_dst_name = 'L'; 
                }
                break;

            case 0x06: 
                var addr;
                if (prefix_ix) {
                    var offset = opcodeReader.readByte();
                    result.operands.offs = offset;
                    result.bytes.push(offset);
                    r_dst_name = '(IX + offs)';
                }
                else if (prefix_iy) {
                    var offset = opcodeReader.readByte();
                    result.operands.offs = offset;
                    result.bytes.push(offset);
                    r_dst_name = '(IY + offs)';
                }
                else {
                    r_dst_name = '(HL)';
                }
                break;

            case 0x07: r_dst_name = 'A'; break;
        }            

        result.mn = 'LD ' + r_dst_name + ', ' + r_src_name;

        return result;
    }

    // 00xxx110
    if ( ( opcode & 0xc7 ) == 0x06 ) {
        // LD r, n
        // LD (HL), n
        // LD (IX + d), n
        // LD (IY + d), n
        // + недокументированные

        var r_dst = (opcode >> 3) & 0x07;
        var r_dst_name;
        switch (r_dst) {
            case 0x00: r_dst_name = 'B'; break;
            case 0x01: r_dst_name = 'C'; break;
            case 0x02: r_dst_name = 'D'; break;
            case 0x03: r_dst_name = 'E'; break;
            case 0x04: 
                if (prefix_ix) {
                    r_dst_name = 'IX&h';
                }
                else if (prefix_iy) {
                    r_dst_name = 'IY&h';
                }
                else {
                    r_dst_name = 'H';
                }
                break;

            case 0x05: 
                if (prefix_ix) {
                    r_dst_name = 'IX&l';
                }
                else if (prefix_iy) {
                    r_dst_name = 'IY&l';
                }
                else {
                    r_dst_name = 'L';
                }
                break;

            case 0x06: 
                var addr;
                if (prefix_ix) {
                    var offset = opcodeReader.readByte();
                    result.operands.offs = offset;
                    result.bytes.push(offset);
                    r_dst_name = '(IX + offs)';
                }
                else if (prefix_iy) {
                    var offset = opcodeReader.readByte();
                    result.operands.offs = offset;
                    result.bytes.push(offset);
                    r_dst_name = '(IY + offs)';
                }
                else {
                    r_dst_name = '(HL)';
                }                    
                break;

            case 0x07: r_dst_name = 'A'; break;
        }

        var val8 = opcodeReader.readByte();
        result.operands.val8 = val8;
        result.bytes.push(val8);
        result.mn = 'LD ' + r_dst_name + ', val8';

        return result;
    }

    // 00xxx010
    if ( (opcode & 0xc7 ) == 0x02 ) {
        // LD A, (BC)
        // LD A, (DE)
        // LD A, (nn)
        // LD HL, (nn)
        // LD IX, (nn)
        // LD IY, (nn)

        // LD (BC), A
        // LD (DE), A
        // LD (nn), A
        // LD (nn), HL
        // LD (nn), IX
        // LD (nn), IY

        var to_reg = !!(opcode & 0x08);
        var r_code = (opcode >> 4) & 0x03;

        if (to_reg) {
            switch (r_code) {
                case 0x00: result.mn = 'LD A, (BC)'; break;
                case 0x01: result.mn = 'LD A, (DE)'; break;
                case 0x02: 
                    // HL, (nn)
                    var targetAddr = opcodeReader.readWord();
                    result.bytes.push(targetAddr & 0xff, targetAddr >> 8);

                    if (prefix_ix) {
                        result.mn = 'LD IX, (addr)';
                    }
                    else if (prefix_iy) {
                        result.mn = 'LD IY, (addr)';
                    }
                    else {
                        result.mn = 'LD HL, (addr)';
                    }

                    result.operands.addr = targetAddr;
                    break;

                case 0x03:
                    // A, (nn)
                    var targetAddr = opcodeReader.readWord();
                    result.bytes.push(addr & 0xff, addr >> 8);
                    result.mn = 'LD A, (addr)';
                    result.operands.addr = targetAddr;
                    break;
            }
        }
        else {
            switch (r_code) {
                case 0x00: result.mn = 'LD (BC), A'; break;
                case 0x01: result.mn = 'LD (DE), A'; break;
                case 0x02:
                    // (nn), HL
                    var targetAddr = opcodeReader.readWord();
                    result.bytes.push(targetAddr & 0xff, targetAddr >> 8);

                    if (prefix_ix) {
                        result.mn = 'LD (addr), IX'
                    }
                    else if (prefix_iy) {
                        result.mn = 'LD (addr), IY'
                    }
                    else {
                        result.mn = 'LD (addr), HL'
                    }

                    result.operands.addr = targetAddr;
                    break;

                case 0x03:
                    // (nn), A
                    var targetAddr = opcodeReader.readWord();
                    result.bytes.push(targetAddr & 0xff, targetAddr >> 8);
                    result.mn = 'LD (addr), A';
                    result.operands.addr = targetAddr;
                    break;
            }
        }

        return result;
    }

    // 00xx0001
    if ( ( opcode & 0xcf ) == 0x01 ) {
        // LD dd, nn
        // LD IX, nn
        // LD IY, nn

        var value = opcodeReader.readWord();
        result.bytes.push(value & 0xff, value >> 8);

        var dd = (opcode >> 4) & 0x03;

        var reg_name;
        switch (dd) {
            case 0x00: reg_name = 'BC'; break;
            case 0x01: reg_name = 'DE'; break;
            case 0x02: 
                if (prefix_ix) {
                    reg_name = 'IX';
                }
                else if (prefix_iy) {
                    reg_name = 'IY'
                }
                else {
                    reg_name = 'HL'
                }
                break;

            case 0x03: reg_name = 'SP'; break;
        }

        result.mn = 'LD ' + reg_name + ', val16';
        result.operands.val16 = value;
        return result;
    }

    // 11xx0x01
    if ( (opcode & 0xcb) == 0xc1 ) {
        // PUSH qq
        // PUSH IX
        // PUSH IY
        // POP qq
        // POP IX
        // POP IY

        var to_reg = !(opcode & 0x04);
        var qq = (opcode >> 4) & 0x03;

        var reg_name;
        switch (qq) {
            case 0x00: reg_name = 'BC'; break;
            case 0x01: reg_name = 'DE'; break;
            case 0x02:
                if (prefix_ix) {
                    reg_name = 'IX';
                }
                else if (prefix_iy) {
                    reg_name = 'IY';
                }
                else {
                    reg_name = 'HL';
                }
                break;

            case 0x03: reg_name = 'AF'; break;
        }

        result.mn = ( to_reg ? 'POP ' : 'PUSH ' ) + reg_name;
        return result;
    }

    // 11111001
    if ( opcode == 0xf9 ) {
        // LD SP, HL
        // LD SP, IX
        // LD SP, IY

        if (prefix_ix) {
            result.mn = 'LD SP, IX';
        }
        else if (prefix_iy) {
            result.mn = 'LD SP, IY';
        }
        else {
            result.mn = 'LD SP, HL';
        }

        return result;
    }

    if ( opcode == 0xeb ) {
        // EX DE, HL
        result.mn = 'EX DE, HL';
        return result;
    }

    if ( opcode == 0x08 ) {
        // EX AF, AF'
        result.mn = 'EX AF, AF\'';
        return result;
    }

    if ( opcode == 0xd9 ) {
        // EXX
        result.mn = 'EXX';
        return result;
    }

    if ( opcode == 0xe3 ) {
        // EX (SP), HL
        // EX (SP), IX
        // EX (SP), IY

        if (prefix_ix) {
            result.mn = 'EX (SP), IX';
        }
        else if (prefix_iy) {
            result.mn = 'EX (SP), IY';
        }
        else {
            result.mn = 'EX (SP), HL';
        }

        return result;
    }

    // 10xxxxxx and 11xxx110
    if ( ( opcode & 0xc0 ) == 0x80 || ( opcode & 0xc7 ) == 0xc6 ) {
        // ADD A, r
        // ADD A, n
        // ADD A, (HL)
        // ADD A, (IX + d)
        // ADD A, (IY + d)
        // ADC A, r
        // ADC A, n
        // ADC A, (HL)
        // ADC A, (IX + d)
        // ADC A, (IY + d)
        // SUB r
        // SUB n
        // SUB (HL)
        // SUB (IX + d)
        // SUB (IY + d)
        // SBC A, r
        // SBC A, n
        // SBC A, (HL)
        // SBC A, (IX + d)
        // SBC A, (IY + d)
        // AND r
        // AND n
        // AND (HL)
        // AND (IX + d)
        // AND (IY + d)
        // OR r
        // OR n
        // OR (HL)
        // OR (IX + d)
        // OR (IY + d)
        // XOR r
        // XOR n
        // XOR (HL)
        // XOR (IX + d)
        // XOR (IY + d)                
        // CP r
        // CP n
        // CP (HL)
        // CP (IX + d)
        // CP (IY + d)
        // + недокументированные

        var operand;
        var explicit_operand = !!(opcode & 0x40);
        if (explicit_operand) {
            operand = 'val8';
            var val8 = opcodeReader.readByte(); // n
            result.operands.val8 = val8;
            result.bytes.push(val8);
        }
        else {
            var r1 = opcode & 0x07;
            switch (r1) {
                case 0x00: operand = 'B'; break; // B
                case 0x01: operand = 'C'; break; // C
                case 0x02: operand = 'D'; break; // D
                case 0x03: operand = 'E'; break; // E
                case 0x04: 
                    if (prefix_ix) {
                        operand = 'IX&h'; // IXh
                    }
                    else if (prefix_iy) {
                        operand = 'IY&h'; // IYh
                    }
                    else {
                        operand = 'H'; // H
                    }
                    break;

                case 0x05: 
                    if (prefix_ix) {    
                        operand = 'IX&l'; // IXl
                    }
                    else if (prefix_iy) {
                        operand = 'IY&l'; // IYl
                    }
                    else {
                        operand = 'L'; // L
                    }
                    break;

                case 0x06:
                    if (prefix_ix) {
                        operand = '(IX + offs)'; // (IX + d)
                        var offset = opcodeReader.readByte();
                        result.operands.offs = offset;
                        result.bytes.push(offset);
                    }
                    else if (prefix_iy) {
                        operand = '(IY + offs)'; // (IY + d)
                        var offset = opcodeReader.readByte();
                        result.operands.offs = offset;
                        result.bytes.push(offset);
                    }
                    else {
                        operand = operand = '(HL)'; // (HL)
                    }
                    break;

                case 0x07: operand = 'A'; break; // A
            }
        }

        var logic = !!(opcode & 0x20);
        if (logic) { // logic
            var subcode = (opcode >> 3) & 0x03;

            switch (subcode) {
                case 0x00: result.mn = 'AND ' + operand; break;
                case 0x01: result.mn = 'XOR ' + operand; break;
                case 0x02: result.mn = 'OR ' + operand; break;
                case 0x03: result.mn = 'CP ' + operand; break;
            }
        }
        else { // arithmetic
            var care_case = !!(opcode & 0x08);
            var addition = !(opcode & 0x10);

            if (addition) {
                result.mn = ( care_case ? 'ADC A, ' : 'ADD A, ' ) + operand;
            }
            else {
                result.mn = ( care_case ? 'SBC A, ' : 'SUB ' ) + operand;
            }
        }

        return result;
    }

    // 00xxx10x
    if ( (opcode & 0xc6 ) == 0x04 ) {
        // INC r
        // INC (HL)
        // INC (IX + d)
        // INC (IY + d)
        // DEC r
        // DEC (HL)
        // DEC (IX + d)
        // DEC (IY + d)
        // + недокументированные


        var r1 = (opcode >> 3) & 0x07;
        var cmd_inc = !(opcode & 0x01);

        var reg_name;
        switch (r1) {
            case 0x00: reg_name = 'B'; break;
            case 0x01: reg_name = 'C'; break;
            case 0x02: reg_name = 'D'; break;
            case 0x03: reg_name = 'E'; break;
            case 0x04:
                if (prefix_ix) {
                    reg_name = 'IX&h';
                }
                else if (prefix_iy) {
                    reg_name = 'IY&h';
                }
                else {
                    reg_name = 'H';
                }
                break;

            case 0x05:
                if (prefix_ix) {
                    reg_name = 'IX&l';
                }
                else if (prefix_iy) {
                    reg_name = 'IY&l';
                }
                else {
                    reg_name = 'L';
                }
                break;   

            case 0x06:
                if (prefix_ix) {
                    // (IX + d)
                    var offset = opcodeReader.readByte();
                    result.operands.offs = offset;
                    result.bytes.push(offset);
                    reg_name = '(IX + offs)';
                }
                else if (prefix_iy) {
                    // (IY + d)
                    var offset = opcodeReader.readByte();
                    result.operands.offs = offset;
                    result.bytes.push(offset);
                    reg_name = '(IY + offs)';
                }
                else {
                    // (HL)
                    reg_name = '(HL)';
                }
                break;

            case 0x07: reg_name = 'A'; break;
        }

        result.mn = ( cmd_inc ? 'INC ' : 'DEC ' ) + reg_name;
        return result;
    }

    // 1111x011
    if ( (opcode & 0xf7 ) == 0xf3 ) {
        // DI
        // EI

        var allow_int = !!(opcode & 0x08);
        result.mn = allow_int ? 'EI' : 'DI';
        return result;
    }

    // 00100111
    if ( opcode == 0x27 ) {
        // DAA
        result.mn = 'DAA';
        return result;
    }

    // 00101111
    if ( opcode == 0x2f ) {
        // CPL

        result.mn = 'CPL';
        return result;
    }

    // 00111111
    if ( opcode == 0x3f ) {
        // CCF

        result.mn = 'CCF';
        return result;
    }

    // 00110111
    if ( opcode == 0x37 ) {
        // SCF

        result.mn = 'SCF';
        return result;
    }

    // 00xx1001
    if ( ( opcode & 0xcf ) == 0x09 ) {
        // ADD HL, ss
        // ADD IX, pp
        // ADD IY, rr

        var ss = (opcode >> 4) & 0x03;
        var operand;
        switch (ss) {
            case 0x00: operand = 'BC'; break; // BC
            case 0x01: operand = 'DE'; break; // DE
            case 0x02:
                if (prefix_ix) {
                    operand = 'IX'; // IX
                }
                else if (prefix_iy) {
                    operand = 'IY'; // IY
                }
                else {
                    operand = 'HL'; // HL
                }
                break;

            case 0x03: operand = 'SP'; break; // SP
        }

        if (prefix_ix) {
            result.mn = 'ADD IX, ' + operand;
        }
        else if (prefix_iy) {
            result.mn = 'ADD IY, ' + operand;
        }
        else {
            result.mn = 'ADD HL, ' + operand;
        }

        return result;
    }

    // 00xxx011
    if ( (opcode & 0xc7 ) == 0x03 ) {
        // INC ss
        // INC IX
        // INC IY
        // DEC ss
        // DEC IX
        // DEC IY

        var cmd_inc = !(opcode & 0x08);
        var ss = (opcode >> 4) & 0x03;

        var reg_name;
        switch (ss) {
            case 0x00: reg_name = 'BC'; break; // BC
            case 0x01: reg_name = 'DE'; break; // DE
            case 0x02:
                if (prefix_ix) {
                    reg_name = 'IX'; // IX
                }
                else if (prefix_iy) {
                    reg_name = 'IY'; // IY
                }
                else {
                    reg_name = 'HL'; // HL
                }
                break;

            case 0x03: reg_name = 'SP'; break; // SP
        }

        result.mn = ( cmd_inc ? 'INC ' : 'DEC ' ) + reg_name;
        return result;
    }

    // 000xx111
    if ( (opcode & 0xe7 ) == 0x07 ) {
        // RLCA
        // RLA
        // RRCA
        // RRA

        var left = !(opcode & 0x08);
        var carry = !(opcode & 0x10);

        result.mn = 'R' + ( left ? 'L' : 'R' ) + ( carry ? 'C' : '' ) + 'A';
        return result;
    }

    // 11000011
    if ( opcode == 0xc3 ) {
        // JP nn

        var targetAddr = opcodeReader.readWord();
        result.operands.addr = targetAddr;
        result.bytes.push(targetAddr & 0xff, targetAddr >> 8);
        result.mn = 'JP addr';
        return result;
    }

    // 11xxx010
    if ( (opcode & 0xc7 ) == 0xc2 ) {
        // JP cc, nn

        var condition_code = (opcode >> 3) & 0x07;

        var condition;
        switch (condition_code) {
            case 0x00: condition = 'NZ'; break; // NZ
            case 0x01: condition = 'Z'; break; // Z
            case 0x02: condition = 'NC'; break; // NC
            case 0x03: condition = 'C'; break; // C
            case 0x04: condition = 'PO'; break; // PO
            case 0x05: condition = 'PE'; break; // PE
            case 0x06: condition = 'P'; break; // P
            case 0x07: condition = 'M'; break; // M
        }

        var targetAddr = opcodeReader.readWord();
        result.bytes.push(targetAddr & 0xff, targetAddr >> 8);
        result.operands.addr = targetAddr;
        result.mn = 'JP ' + condition + ', addr';
        return result;
    }

    // 00xxx000 where xxx >= 010
    if ( ( opcode & 0xc7 ) == 0x00 && ( opcode & 0x38 ) >= 0x10 ) {
        // JR e
        // JR C, e
        // JR NC, e
        // JR Z, e
        // JR NZ, e
        // DJNZ e

        var condition_code = (opcode >> 3) & 0x07;

        var condition;
        switch (condition_code) {
            case 0x02: result.mn = 'DJNZ addr'; break;
            case 0x03: result.mn = 'JR addr'; break; // JR e
            case 0x04: result.mn = 'JR NZ, addr'; break; // JR NZ, e
            case 0x05: result.mn = 'JR Z, addr'; break; // JR Z, e
            case 0x06: result.mn = 'JR NC, addr'; break; // JR NC, e
            case 0x07: result.mn = 'JR C, addr'; break; // JR C, e
        }

        var offset = opcodeReader.readByte();
        result.bytes.push(offset);

        if ( offset & 0x80 ) {
            offset |= 0xFF00;
        }
        result.operands.addr = (opcodeReader.next + offset) & 0xFFFF;
        return result;
    }

    // 11101001
    if ( opcode == 0xe9 ) {
        // JP (HL)
        // JP (IX)
        // JP (IY)
        // * это не косвенная адресация, читать мнемонику без скобок!

        if (prefix_ix) {
            result.mn = 'JP (IX)';
        }
        else if (prefix_iy) {
            result.mn = 'JP (IY)';
        }
        else {
            result.mn = 'JP (HL)';
        }

        return result;
    }

    // 11001101
    if ( opcode == 0xcd ) {
        // CALL nn

        var targetAddr = opcodeReader.readWord();
        result.bytes.push(targetAddr & 0xff, targetAddr >> 8);
        result.operands.addr = targetAddr;
        result.mn = 'CALL addr';
        return result;
    }

    // 11xxx100
    if ( ( opcode & 0xc7 ) == 0xc4 ) {
        // CALL cc, nn

        var condition_code = (opcode >> 3) & 0x07;

        var condition;
        switch (condition_code) {
            case 0x00: condition = 'NZ'; break; // NZ
            case 0x01: condition = 'Z'; break; // Z
            case 0x02: condition = 'NC'; break; // NC
            case 0x03: condition = 'C'; break; // C
            case 0x04: condition = 'PO'; break; // PO
            case 0x05: condition = 'PE'; break; // PE
            case 0x06: condition = 'P'; break; // P
            case 0x07: condition = 'M'; break; // M
        }

        var targetAddr = opcodeReader.readWord();
        result.bytes.push(targetAddr & 0xff, targetAddr >> 8);
        result.operands.addr = targetAddr;
        result.mn = 'CALL ' + condition + ', addr';
        return result;
    }

    // 11001001
    if ( opcode == 0xc9 ) {
        // RET

        result.mn = 'RET';
        return result;
    }

    // 11xxx000
    if ( ( opcode & 0xc7 ) == 0xc0 ) {
        // RET cc

        var condition_code = (opcode >> 3) & 0x07;

        var condition;
        switch (condition_code) {
            case 0x00: condition = 'NZ'; break; // NZ
            case 0x01: condition = 'Z'; break; // Z
            case 0x02: condition = 'NC'; break; // NC
            case 0x03: condition = 'C'; break; // C
            case 0x04: condition = 'PO'; break; // PO
            case 0x05: condition = 'PE'; break; // PE
            case 0x06: condition = 'P'; break; // P
            case 0x07: condition = 'M'; break; // M
        }

        result.mn = 'RET ' + condition;
        return result;
    }

    // 11xxx111
    if ( (opcode & 0xc7 ) == 0xc7 ) {
        // RST p

        var rst_code = (opcode >> 3) & 0x07;
        var targetAddr = rst_code << 3; // code * 8

        result.mn = 'RST addr';
        result.operands.addr = targetAddr;
        return result;
    }

    // 1101x011
    if ( ( opcode & 0xf7 ) == 0xd3 ) {
        // IN A, (n)
        // OUT (n), A

        var port_low = opcodeReader.readByte();
        result.bytes.push(port_low);
        result.operands.port = port_low;

        var cmd_in = !!(opcode & 0x08);
        if (cmd_in) {
            // IN
            result.mn = 'IN A, (port)'
        }
        else {
            // OUT
            result.mn = 'OUT (port), A'
        }

        return result;
    } 

    result.mn = 'UNKNOWN';
    return result;
}
