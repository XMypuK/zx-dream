function Z80 (bus) {
    'use strict';
    
    // счетчик тактов
    var ts_cnt = 0;

    // регистры процессора
    var pc = 0;
    var sp = 0xffff;
    var ix = 0;
    var iy = 0;
    
    var i = 0;
    var r = 0;
    
    var iff = 0;
    var imf = 0;

    var a = 0xff;
    var f = new Flags();
    var regs = new RegSet();
    
    var a_ = 0xff;
    var f_ = new Flags();
    var regs_ = new RegSet();

    function Flags() {
        var self = this;

        self.s = 1;
        self.z = 1;
        self.y = 1;
        self.h = 1;
        self.x = 1;
        self.p = 1;
        self.n = 1;
        self.c = 1;

        self.get = function() {
            return (
                ( self.s ? 0x80 : 0 ) |
                ( self.z ? 0x40 : 0 ) |
                ( self.y ? 0x20 : 0 ) |
                ( self.h ? 0x10 : 0 ) |
                ( self.x ? 0x08 : 0 ) |
                ( self.p ? 0x04 : 0 ) |
                ( self.n ? 0x02 : 0 ) |
                ( self.c ? 0x01 : 0 )
            );
        }

        self.set = function( value ) {
            self.s = ( value & 0x80 );
            self.z = ( value & 0x40 );
            self.y = ( value & 0x20 );
            self.h = ( value & 0x10 );
            self.x = ( value & 0x08 );
            self.p = ( value & 0x04 );
            self.n = ( value & 0x02 );
            self.c = ( value & 0x01 );
        }
    }

    function RegSet() {
        var self = this;

        self.b = 0;
        self.c = 0;
        self.d = 0;
        self.e = 0;
        self.h = 0;
        self.l = 0;
    }

    // префиксы расширенных команд
    var prefix_ix = false;
    var prefix_iy = false;
    var prefix_ext = false;
    var prefix_bit = false;

    var index_offset_cache = 0;

    // запросы на прерывания
    var nmi_request = false;
    var int_request = false;
    var int_request_data = 0xff;

    /////////////////////////////////////
    // фуикции чтения/записи регистров //
    /////////////////////////////////////

    function set_af( value ) {
        a = ( value >> 8 );
        f.set( value & 0xff );
    }
    function get_af() { return ( a << 8 ) | f.get(); }
    
    function set_bc( value ) {
        regs.b = ( value >> 8 );
        regs.c = ( value & 0xff );
    }
    function get_bc() { return ( regs.b << 8 ) | regs.c; }

    function set_de( value ) {
        regs.d = ( value >> 8 );
        regs.e = ( value & 0xff );
    }
    function get_de() { return ( regs.d << 8 ) | regs.e; }

    function set_hl( value ) {
        regs.h = ( value >> 8 );
        regs.l = ( value & 0xff );
    }
    function get_hl() { return ( regs.h << 8 ) | regs.l; }

    function set_ix_h( value ) { ix = ( ix & 0x00ff ) | ( value << 8 ); }
    function get_ix_h() { return ( ix >> 8 ); }

    function set_ix_l( value ) { ix = ( ix & 0xff00 ) | value; }
    function get_ix_l() { return ( ix & 0xff ); }

    function set_iy_h( value ) { iy = ( iy & 0x00ff ) | ( value << 8 ); }
    function get_iy_h() { return ( iy >> 8 ); }

    function set_iy_l( value ) { iy = ( iy & 0xff00 ) | value; }
    function get_iy_l() { return ( iy & 0xff ); }

    ////////////////////////////////////////
    // фуикции чтения/записи спец. флагов //
    ////////////////////////////////////////

    function flag_iff1(value) {
        if (value !== undefined) {
            if (value) {
                iff |= 0x02;
            }
            else {
                iff &= 0xfd;
            }
        }
        else {
            return !!(iff & 0x02);
        }
    }

    function flag_iff2(value) {
        if (value !== undefined) {
            if (value) {
                iff |= 0x01;
            }
            else {
                iff &= 0xfe;
            }
        }
        else {
            return !!(iff & 0x01);
        }
    }

    function flag_imfa(value) {
        if (value !== undefined) {
            if (value) {
                imf |= 0x02;
            }
            else {
                imf &= 0xfd;
            }
        }
        else {
            return !!(imf & 0x02);
        }
    }

    function flag_imfb(value) {
        if (value !== undefined) {
            if (value) {
                imf |= 0x01;
            }
            else {
                imf &= 0xfe;
            }
        }
        else {
            return !!(imf & 0x01);
        }
    }


    ///////////////////////////////////////////////////////////
    // функции обращения к памяти и устройствам ввода/вывода //
    ///////////////////////////////////////////////////////////

    function read_opcode() {
        var state = {
            mreq: true,
            iorq: false,
            m1: true,
            read: true,
            write: false,
            address: pc,
            data: 0,
            size: 1
        }

        bus.request(state);
        pc = ( pc + 1 ) & 0xffff;
        r = ( r & 0x80 ) | (( r + 1 ) & 0x7f );
        ts_cnt += 4;

        return state.data;
    }

    function read_operand_byte() {
        var state = {
            mreq: true,
            iorq: false,
            m1: true,
            read: true,
            write: false,
            address: pc,
            data: 0,
            size: 1
        }

        bus.request(state);
        pc = ( pc + 1 ) & 0xffff;
        ts_cnt += 3;

        return state.data;
    }

    function read_operand_word() {
        var low_byte = read_operand_byte();
        var high_byte = read_operand_byte();
        return low_byte | ( high_byte << 8 );
    }

    function mem_byte(address, value) {
        var state = {
            mreq: true,
            iorq: false,
            m1: false,
            read: false,
            write: false,
            address: address,
            data: 0,
            size: 1
        };

        var res;

        if (value !== undefined) {
            state.write = true;
            state.data = value;
            bus.request(state);
        }
        else {
            state.read = true;
            bus.request(state);
            res = state.data;
        }

        ts_cnt += 3;

        return res;
    }

    function mem_word(address, value) {
        if ( value !== undefined ) {
            mem_byte( address, value & 0xff )
            mem_byte(( address + 1 ) & 0xffff, value >> 8 );
            return;
        }
        else {
            var low_byte = mem_byte(address);
            var high_byte = mem_byte(( address + 1 ) & 0xffff );
            return low_byte | ( high_byte << 8 );
        }
    }

    function io_byte(port, value) {
        var state = {
            mreq: false,
            iorq: true,
            m1: false,
            read: false,
            write: false,
            address: port,
            data: 0,
            size: 1
        };

        var res;

        if (value !== undefined) {
            state.write = true;
            state.data = value;
            bus.request(state);
        }
        else {
            state.read = true;
            bus.request(state);
            res = state.data;
        }

        ts_cnt += 4;

        return res;
    }

    function is_halt() {
        var state = {
            mreq: true,
            iorq: false,
            m1: true,
            read: true,
            write: false,
            address: pc,
            data: 0,
            size: 1
        }

        bus.request(state);

        return state.data == 0x76;
    }

    ///////////////////////////////////////////
    // функции обработки команд и прерываний //
    ///////////////////////////////////////////

    function process() {
        // обработка прерываний:
        // если выполняется команда с данными префиксами,
        // то ждем завершения
        if (!prefix_bit && !prefix_ext) {

            // проверка на запрос немаскируемого прерывания
            if (nmi_request) {
                nmi_request = false;

                // total: + 11 t-states
                flag_iff1(false);

                r = ( r & 0x80 ) | (( r + 1 ) & 0x7f );

                if ( is_halt() ) {
                    pc = ( pc + 1 ) & 0xffff;
                }                
                else if ( prefix_iy || prefix_ix ) {
                    // если включен какой-то из индексных префиксов,
                    // то после прерывания надо заного его включить,
                    // поэтому адрес возврата делаем на единицу меньше
                    pc = ( pc - 1 ) & 0xffff;
                }

                prefix_iy = false;
                prefix_ix = false;

                sp = ( sp - 2 ) & 0xffff;
                mem_word(sp, pc);
                pc = 0x0066;

                ts_cnt += 5;

                return;
            }

            // проверка на запрос маскируемого прерывания
            if (int_request) {
                int_request = false;

                // если маскируемые прерывания включены
                if (flag_iff1()) {
                    flag_iff1(false);
                    flag_iff2(false);
                
                    r = ( r & 0x80 ) | (( r + 1 ) & 0x7f );

                    if ( is_halt() ) {
                        pc = ( pc + 1 ) & 0xffff;
                    }   
                    else if ( prefix_iy || prefix_ix ) {
                        // если включен какой-то из индексных префиксов,
                        // то после прерывания надо заного его включить,
                        // поэтому адрес возврата делаем на единицу меньше
                        pc = ( pc - 1 ) & 0xffff;
                    }

                    prefix_iy = false;
                    prefix_ix = false;

                    ts_cnt += 2 + 4;

                    switch (imf) {
                        case 0x00:
                        case 0x01:
                            // IM 0
                            // total: + 13 t-states
                            do_operation(int_request_data);
                            break;

                        case 0x02:
                            // IM 1
                            // total: + 13 t-states
                            do_operation(0xff); // RST #38
                            break;

                        case 0x03:
                            // IM 2
                            // total: + 19 t-states
                            var ref_addr = ( i << 8 ) | int_request_data;
                            var hnd_addr = mem_word(ref_addr);

                            sp = ( sp - 2 ) & 0xffff;
                            mem_word(sp, pc);
                            pc = hnd_addr;

                            ts_cnt += 1;

                            break;
                    }

                    return;
                }
            }
        }

        var opcode = read_opcode();

        // проверка на префиксы

        // если предыдущий код был префиксом 0xED или 0xCB
        // то следующий код должен быть командой, поэтому
        // проверка осуществляется, только если это не так.
        if ( !prefix_bit && !prefix_ext ) {
            // 11x11101
            if (( opcode & 0xdf ) == 0xdd ) {
                // IX
                // IY
                prefix_ix = !(opcode & 0x20);
                prefix_iy = !prefix_ix;
                prefix_ext = false;
                prefix_bit = false;
                return;
            }

            if ( opcode == 0xed ) {
                // 0xED
                prefix_ix = false;
                prefix_iy = false;
                prefix_ext = true;
                prefix_bit = false;
                return;
            }

            if ( opcode == 0xcb ) {
                // 0xCB
                prefix_ext = false;
                prefix_bit = true;

                // надо сразу прочитать смещение, если были индексные префиксы
                if (prefix_ix || prefix_iy) {
                    index_offset_cache = byte_to_svalue(read_operand_byte());
                }                
                return;                
            }
        }

        do_operation(opcode);

        prefix_ix = false;
        prefix_iy = false;
        prefix_ext = false;
        prefix_bit = false;
    }

    function do_operation(opcode) {
        if (prefix_ext) {

            // 010xx111
            if ( ( opcode & 0xe7 ) == 0x47 ) {
                // LD A, I      ( 4 + 4 ) + 1
                // LD A, R      -//-
                // LD I, A
                // LD R, A
                var subcode = (opcode >> 3) & 0x03;
                switch (subcode) {
                    case 0x00: i = a; break;
                    case 0x01: r = a; break;

                    /*
                        Команды LD A, I и LD A, R по спецификации должны копировать флаг
                        прерываний iff2 во флаг четности. Однако в реальном Z80 существует
                        баг, что если в этот момент поступит сигнал прерывания, то во флаг
                        четности запишется 0.

                        Представленный тут алгоритм также реализует подобное поведение,
                        однако нет уверенности, что оно совпадает с оригинальным на 100%.
                        (Имеется ввиду соответствие интервалов времени и режима прерываний,
                        на основе которых принимается решение о значении флага.)
                    */

                    case 0x02: 
                        a = i;
                        f.s = a & 0x80;
                        f.z = !a;
                        f.y = a & 0x20;
                        f.h = 0;
                        f.x = a & 0x08;
                        f.p = ( flag_iff1() && int_request ) ? 0 : flag_iff2();
                        f.n = 0;
                        break;

                    case 0x03: 
                        a = r;
                        f.s = a & 0x80;
                        f.z = !a;
                        f.y = a & 0x20;
                        f.h = 0;
                        f.x = a & 0x08;
                        f.p = ( flag_iff1() && int_request ) ? 0 : flag_iff2();
                        f.n = 0;
                        break;
                }

                ts_cnt += 1;

                return;
            }

            // 01xxx011
            if ( (opcode & 0xc7 ) == 0x43 ) {
                // LD dd, (nn)  ( 4 + 4 + 3 + 3 + 3 + 3 )
                // LD (nn), dd  -//-

                var addr = read_operand_word();

                var to_reg = !!(opcode & 0x08);
                var dd = (opcode >> 4) & 0x03;

                if (to_reg) {
                    var value = mem_word(addr);
                    switch (dd) {
                        case 0x00: set_bc(value); break;
                        case 0x01: set_de(value); break;
                        case 0x02: set_hl(value); break;
                        case 0x03: sp = value; break;
                    }
                }
                else { // to_mem
                    var value;
                    switch (dd) {
                        case 0x00: value = get_bc(); break;
                        case 0x01: value = get_de(); break;
                        case 0x02: value = get_hl(); break;
                        case 0x03: value = sp; break;
                    }
                    mem_word(addr, value);
                }

                return;
            }

            // 101xx000
            if ( (opcode & 0xe7 ) == 0xa0 ) {
                // LDI      ( 4 + 4 + 3 + 3 ) + 2
                // LDIR     ( 4 + 4 + 3 + 3 ) + 2 + 5?
                // LDD      ( 4 + 4 + 3 + 3 ) + 2
                // LDDR     ( 4 + 4 + 3 + 3 ) + 2 + 5?

                var increment = !(opcode & 0x08);
                var repeat = !!(opcode & 0x10);

                var cur_hl = get_hl();
                var cur_de = get_de();
                var cur_bc = get_bc();

                var data = mem_byte(cur_hl);
                mem_byte(cur_de, data);

                if (increment) {
                    cur_hl = (cur_hl + 1) & 0xffff;
                    cur_de = (cur_de + 1) & 0xffff;
                }
                else {
                    cur_hl = (cur_hl - 1) & 0xffff;
                    cur_de = (cur_de - 1) & 0xffff;
                }

                cur_bc = (cur_bc - 1) & 0xffff;

                set_hl(cur_hl);
                set_de(cur_de);
                set_bc(cur_bc);

                var _undoc_support = a + data;
                f.y = ( _undoc_support & 0x02 );
                f.h = 0;
                f.x = ( _undoc_support & 0x08 );
                f.p = cur_bc; // != 0
                f.n = 0;

                ts_cnt += 2;

                if ( repeat && cur_bc ) {
                    pc = ( pc - 2 ) & 0xffff;
                    ts_cnt += 5;
                }

                return;
            }

            // 101xx001
            if ( (opcode & 0xe7 ) == 0xa1 ) {
                // CPI          ( 4 + 4 + 3 ) + 5
                // CPIR         ( 4 + 4 + 3 ) + 5 + 5?
                // CPD          ( 4 + 4 + 3 ) + 5
                // CPDR         ( 4 + 4 + 3 ) + 5 + 5?

                var increment = !(opcode & 0x08);
                var repeat = !!(opcode & 0x10);

                var cur_hl = get_hl();
                var cur_bc = get_bc();

                var data = mem_byte(cur_hl);
                var cmp_res = (a - data) & 0xff;
                var cmp_half = ((a & 0x0f) - (data & 0x0f)) < 0;

                if (increment) {
                    cur_hl = (cur_hl + 1) & 0xffff;
                }
                else {
                    cur_hl = (cur_hl - 1) & 0xffff;
                }

                cur_bc = (cur_bc - 1) & 0xffff;

                set_hl(cur_hl);
                set_bc(cur_bc);
                
                var _undoc_support = ( cmp_res - ( cmp_half ? 1 : 0 )) & 0xff;
                f.s = cmp_res & 0x80;
                f.z = !cmp_res;
                f.y = ( _undoc_support & 0x02 );
                f.h = cmp_half;
                f.x = ( _undoc_support & 0x08 );
                f.p = cur_bc; // != 0
                f.n = 1;

                ts_cnt += 5;

                if ( repeat && !cur_bc && !cmp_res ) {
                    pc = ( pc - 2 ) & 0xffff;
                    ts_cnt += 5;
                }

                return;
            }

            // 01xxx100
            if (( opcode & 0xc7 ) == 0x44 ) {
                // NEG          ( 4 + 4 )
                // * включая все недокументированные варианты опкодов

                var old_a = a;
                a = ( 0x100 - a ) & 0xff;

                f.s = a & 0x80;
                f.z = !a;
                f.y = a & 0x20;
                f.h = ( old_a & 0x0f ); // 0 - ( old_a & 0x0f ) < 0
                f.x = a & 0x08;
                f.p = old_a == 0x80;
                f.n = 1;
                f.c = !old_a;

                return;
            }

            // 01xxx110
            if ( ( opcode & 0xc7 ) == 0x46 ) {
                // IM 0         ( 4 + 4 )
                // IM 1         -//-
                // IM 2
                // * включая все недокументированные варианты опкодов

                flag_imfa(!!(opcode & 0x10));
                flag_imfb(!!(opcode & 0x08));

                return;
            }

            // 01xxx010
            if ( (opcode & 0xc7 ) == 0x42 ) {
                // ADC HL, ss       ( 4 + 4 ) + 7
                // SBC HL, ss       ( 4 + 4 ) + 7

                var addition = !!(opcode & 0x08);
                var ss = (opcode >> 4) & 0x03;

                var operand;
                switch (ss) {
                    case 0x00: operand = get_bc(); break; // BC
                    case 0x01: operand = get_de(); break; // DE
                    case 0x02: operand = get_hl(); break; // HL
                    case 0x03: operand = sp; break; // SP
                }
                if ( f.c ) {
                    operand++;
                }

                var current = get_hl();

                if (addition) {
                    // addition
                    var result = current + operand;
                    var care = result & 0x10000;
                    result &= 0xffff;

                    set_hl(result);
                    f.s = result & 0x8000;
                    f.z = !result;
                    f.y = result & 0x2000;
                    f.h = ((current & 0x0fff) + (operand & 0x0fff)) & 0x1000;
                    f.x = result & 0x0800;
                    f.p = get_word_sum_overflow(current, operand, result);
                    f.n = 0;
                    f.c = care;
                }
                else { 
                    // subtraction
                    var result = current - operand;
                    var borrow = result < 0;
                    result &= 0xffff;

                    set_hl(result);
                    f.s = result & 0x8000;
                    f.z = !result;
                    f.y = result & 0x2000;
                    f.h = ((current & 0x0fff) - (operand & 0x0fff)) < 0;
                    f.x = result & 0x0800;
                    f.p = get_word_diff_overflow(current, operand, result);
                    f.n = 1;
                    f.c = borrow;
                }

                ts_cnt += 7;

                return;
            }

            // 0110x111
            if ( (opcode & 0xf7 ) == 0x67 ) {
                // RLD          ( 4 + 4 + 3 + 3 ) + 4
                // RRD          ( 4 + 4 + 3 + 3 ) + 4

                var left = !!(opcode & 0x08);
                var cur_mem = mem_byte(get_hl());

                if (left) {
                    var temp = cur_mem >> 4;
                    cur_mem = (( cur_mem << 4 ) & 0xf0 ) | ( a & 0x0f );
                    a = ( a & 0xf0 ) | temp;
                }
                else {
                    var temp = cur_mem & 0x0f;
                    cur_mem = (( a << 4 ) & 0xf0 ) | ( cur_mem >> 4 );
                    a = ( a & 0xf0 ) | temp;
                }

                mem_byte(get_hl(), cur_mem);
                f.s = a & 0x80;
                f.z = !a;
                f.y = a & 0x20;
                f.h = 0;
                f.x = a & 0x08;
                f.p = get_parity(a);
                f.n = 0;

                ts_cnt += 4;

                return;
            }

            // 01xxx101
            if ( (opcode & 0xc7 ) == 0x45 ) {
                // RETI         ( 4 + 4 + 3 + 3 )
                // RETN         ( 4 + 4 + 3 + 3 )
                // * включая все недокументированные варианты опкодов

                pc = mem_word(sp);
                sp = ( sp + 2 ) & 0xffff;
                flag_iff1(flag_iff2());

                return;
            }

            // 01xxx00x
            if ( ( opcode & 0xc6 ) == 0x40 ) {
                // IN r, (C)        ( 4 + 4 + 4 )
                // OUT (C), r       -//-
                // * IN 0, (C)
                // * OUT (C), 0

                var r1 = (opcode >> 3) & 0x07;
                var cmd_in = !(opcode & 0x01);

                if (cmd_in) {
                    // IN
                    var value = io_byte(get_bc());
                    switch (r1) {
                        case 0x00: regs.b = value; break;
                        case 0x01: regs.c = value; break;
                        case 0x02: regs.d = value; break;
                        case 0x03: regs.e = value; break;
                        case 0x04: regs.h = value; break;
                        case 0x05: regs.l = value; break;
                        case 0x07: a = value; break;
                    }

                    f.s = value & 0x80;
                    f.z = !value;
                    f.y = value & 0x20;
                    f.h = 0;
                    f.x = value & 0x08;
                    f.p = get_parity(value);
                    f.n = 0;
                }
                else {
                    // OUT
                    var value = 0;
                    switch (r1) {
                        case 0x00: value = regs.b; break;
                        case 0x01: value = regs.c; break;
                        case 0x02: value = regs.d; break;
                        case 0x03: value = regs.e; break;
                        case 0x04: value = regs.h; break;
                        case 0x05: value = regs.l; break;
                        case 0x07: value = a; break;
                    }

                    io_byte(get_bc(), value);
                }

                return;
            }

            // 101xx01x
            if ( (opcode & 0xe6 ) == 0xa2 ) {
                // INI              ( 4 + 4 + 4 + 3 ) + 1 + 5?
                // INIR             -//-
                // IND
                // INDR
                // OUTI
                // OTIR
                // OUTD
                // OTDR

                var repeat = !!(opcode & 0x10);
                var increment = !(opcode & 0x08);
                var cmd_in = !(opcode & 0x01);

                var cur_hl = get_hl();

                var old_b = regs.b;
                var new_b = ( regs.b - 1 ) & 0xff;

                var data;
                if (cmd_in) {
                    data = io_byte(( new_b << 8 ) | regs.c ); // именно new_b
                    mem_byte(cur_hl, data);
                }
                else {
                    data = mem_byte(cur_hl);
                    io_byte(( regs.b << 8 ) | regs.c, data);
                }

                regs.b = new_b;

                var new_hl = ( increment ? ( cur_hl + 1 ) : ( cur_hl - 1 )) & 0xffff;
                set_hl(new_hl);

                f.s = regs.b & 0x80;
                f.z = !regs.b;
                f.y = regs.b & 0x20;
                f.x = regs.b & 0x08;
                f.n = data & 0x80;

                var _undoc_support;
                if ( cmd_in ) {
                    _undoc_support = cur_hl + (( regs.c + ( increment ? 1 : -1 )) & 0xff );
                }
                else {
                    _undoc_support = data + ( cur_hl & 0xff );
                }
                f.h = _undoc_support > 255;
                f.c = _undoc_support > 255;
                f.p = ( _undoc_support & 7 ) ^ old_b;                

                ts_cnt += 1;

                if ( repeat && regs.b ) {
                    pc = ( pc - 2 ) & 0xffff;
                    ts_cnt += 5;
                }

                return;
            }

            return;

        } // endif (prefix_ext)

        if (prefix_bit) {
            // 00xxxxxx
            if ( (opcode & 0xc0 ) == 0x00 ) {
                // RLC r                ( 4 + 4 )
                // RLC (HL)             ( 4 + 4 + 3 + 3 ) + 1
                // RLC (IX + d)         ( 4 + 4 + 3 + 3 + 3 ) + 6
                // RLC (IY + d)         ( 4 + 4 + 3 + 3 + 3 ) + 6
                // * RLC (IX + d), r    ??? ( 4 + 4 + 3 + 3 + 3 ) + 6 ???
                // * RLC (IY + d), r    ??? ( 4 + 4 + 3 + 3 + 3 ) + 6 ???
                // RL r                 -//-
                // RL (HL)
                // RL (IX + d)
                // RL (IY + d)
                // * RL (IX + d), r
                // * RL (IY + d), r
                // RRC r
                // RRC (HL)
                // RRC (IX + d)
                // RRC (IY + d)
                // * RRC (IX + d), r
                // * RRC (IY + d), r
                // RR r
                // RR (HL)
                // RR (IX + d)
                // RR (IY + d)
                // * RR (IX + d), r
                // * RR (IY + d), r
                // SLA r
                // SLA (HL)
                // SLA (IX + d)
                // SLA (IY + d)
                // * SLA (IX + d), r
                // * SLA (IY + d), r
                // * SLL r
                // * SLL (HL)
                // * SLL (IX + d)
                // * SLL (IY + d)                
                // * SLL (IX + d), r
                // * SLL (IY + d), r
                // SRA r
                // SRA (HL)
                // SRA (IX + d)
                // SRA (IY + d)
                // * SRA (IX + d), r
                // * SRA (IY + d), r
                // SRL r
                // SRL (HL)
                // SRL (IX + d)
                // SRL (IY + d)
                // * SRL (IX + d), r
                // * SRL (IY + d), r

                var cmd_shift = !!(opcode & 0x20);
                var left = !(opcode & 0x08);
                var without_c = !(opcode & 0x10); // постфикс C при ротации, означает, что флаг C не участвует в ротации!
                var r1 = opcode & 0x07;

                var current;
                if (prefix_ix) {
                    current = mem_byte(( ix + index_offset_cache ) & 0xffff);
                }
                else if (prefix_iy) {
                    current = mem_byte(( iy + index_offset_cache ) & 0xffff);
                }
                else {
                    switch (r1) {
                        case 0x00: current = regs.b; break;
                        case 0x01: current = regs.c; break;
                        case 0x02: current = regs.d; break;
                        case 0x03: current = regs.e; break;
                        case 0x04: current = regs.h; break;
                        case 0x05: current = regs.l; break;
                        case 0x06: current = mem_byte(get_hl()); break;
                        case 0x07: current = a; break;
                    }
                }

                var extra;
                var result;
                if (left) {
                    // left
                    extra = !!(current & 0x80);
                    result = (current << 1) & 0xff;
                    if (cmd_shift) {
                        if ( without_c ) {
                            // SLA
                            // здесь дополнительных действий не требуется
                        }
                        else {
                            // SLL (не документирована)
                            result |= 0x01;
                        }
                        
                        
                    }
                    else {
                        // rotate
                        if ((!without_c && f.c) || (without_c && extra)) {
                            result |= 0x01;
                        }
                    }
                }
                else {
                    // right
                    extra = !!(current & 0x01);
                    result = (current >> 1);
                    if (cmd_shift) {
                        if (without_c) {
                            // SRA
                            // восстанавливаем значение 7-го бита
                            if (current & 0x80) {
                                result |= 0x80;
                            }
                        }
                        else {
                            // SRL
                            // здесь дополнительных действий не требуется
                        }
                    }
                    else {
                        // rotate
                        if ((!without_c && f.c) || (without_c && extra)) {
                            result |= 0x80;
                        }
                    }
                }

                if (prefix_ix) {
                    mem_byte((ix + index_offset_cache) & 0xffff, result);

                    ts_cnt += 6;
                }
                else if (prefix_iy) {
                    mem_byte((iy + index_offset_cache) & 0xffff, result);   

                    ts_cnt += 6;
                }

                switch (r1) {
                    case 0x00: regs.b = result; break;
                    case 0x01: regs.c = result; break;
                    case 0x02: regs.d = result; break;
                    case 0x03: regs.e = result; break;
                    case 0x04: regs.h = result; break;
                    case 0x05: regs.l = result; break;
                    case 0x06:
                        if (!prefix_ix && !prefix_iy) {
                            mem_byte(get_hl(), result);

                            ts_cnt += 1;
                        }
                        break;

                    case 0x07: a = result; break;
                }

                f.s = result & 0x80;
                f.z = !result;
                f.y = result & 0x20;
                f.h = 0;
                f.x = result & 0x08;
                f.p = get_parity(result);
                f.n = 0;
                f.c = extra;

                return;
            }

            // 01xxxxxx
            if ( (opcode & 0xc0 ) == 0x40 ) {
                // BIT b, r             ( 4 + 4 )
                // BIT b, (HL)          ( 4 + 4 + 3 ) + 1
                // BIT b, (IX + d)      ( 4 + 4 + 3 + 3 ) + 6
                // BIT b, (IY + d)      ( 4 + 4 + 3 + 3 ) + 6

                var r_dst = opcode & 0x07;

                var value;
                var index_address;
                if (prefix_ix) {
                    index_address = ( ix + index_offset_cache ) & 0xffff;
                    value = mem_byte(index_address);

                    ts_cnt += 6;
                }
                else if (prefix_iy) {
                    index_address = ( iy + index_offset_cache ) & 0xffff;
                    value = mem_byte(index_address);

                    ts_cnt += 6;
                }
                else {
                    switch (r_dst) {
                        case 0x00: value = regs.b; break;
                        case 0x01: value = regs.c; break;
                        case 0x02: value = regs.d; break;
                        case 0x03: value = regs.e; break;
                        case 0x04: value = regs.h; break;
                        case 0x05: value = regs.l; break;
                        case 0x06: 
                            value = mem_byte(get_hl()); 
                            ts_cnt += 1;
                            break;

                        case 0x07: value = a; break;
                    }
                }

                var bit = (opcode >> 3) & 0x07;
                var mask = 0x01 << bit;
                var res = value & mask;

                // не реализованы недокументированные эффекты команды BIT b, (HL) на флаги x и y
                f.s = res & 0x80;   
                f.z = !res; 
                f.y = ( prefix_ix || prefix_iy ) ? ( index_address & 0x2000 ) : ( res & 0x20 ); 
                f.h = 1;    
                f.x = ( prefix_ix || prefix_iy ) ? ( index_address & 0x0800 ) : ( res & 0x08 ); 
                f.p = !res; 
                f.n = 0;    

                return;
            }

            // 1xxxxxxx
            if ( (opcode & 0x80 ) == 0x80 ) {
                // SET b, r                 ( 4 + 4 )
                // SET b, (HL)              ( 4 + 4 + 3 + 3 ) + 1
                // SET b, (IX + d)          ( 4 + 4 + 3 + 3 + 3 ) + 6
                // SET b, (IY + d)          ( 4 + 4 + 3 + 3 + 3 ) + 6
                // * SET b, (IX + d), r     ??? ( 4 + 4 + 3 + 3 + 3 ) + 6 ???
                // * SET b, (IY + d), r     ??? ( 4 + 4 + 3 + 3 + 3 ) + 6 ???
                // RES b, r                 -//-
                // RES b, (HL)
                // RES b, (IX + d)
                // RES b, (IY + d)
                // * RES b, (IX + d), r
                // * RES b, (IY + d), r

                var r_dst = opcode & 0x07;

                var value;
                if (prefix_ix) {
                    value = mem_byte(( ix + index_offset_cache ) & 0xffff);
                }
                else if (prefix_iy) {
                    value = mem_byte(( iy + index_offset_cache ) & 0xffff);
                }
                else {
                    switch (r_dst) {
                        case 0x00: value = regs.b; break;
                        case 0x01: value = regs.c; break;
                        case 0x02: value = regs.d; break;
                        case 0x03: value = regs.e; break;
                        case 0x04: value = regs.h; break;
                        case 0x05: value = regs.l; break;
                        case 0x06: value = mem_byte(get_hl()); break;
                        case 0x07: value = a; break;
                    }
                }

                var bit = (opcode >> 3) & 0x07;
                var mask = 0x01 << bit;
                var cmd_set = !!(opcode & 0x40);
                if (cmd_set) {
                    value |= mask;
                }
                else {
                    value &= (mask ^ 0xff);
                }

                if (prefix_ix) {
                    mem_byte(( ix + index_offset_cache ) & 0xffff, value);

                    ts_cnt += 6;
                }
                else if (prefix_iy) {
                    mem_byte(( iy + index_offset_cache ) & 0xffff, value);

                    ts_cnt += 6;
                }

                switch (r_dst) {
                    case 0x00: regs.b = value; break;
                    case 0x01: regs.c = value; break;
                    case 0x02: regs.d = value; break;
                    case 0x03: regs.e = value; break;
                    case 0x04: regs.h = value; break;
                    case 0x05: regs.l = value; break;
                    case 0x06:
                        if (!prefix_ix && !prefix_iy) {
                            mem_byte(get_hl(), value);

                            ts_cnt += 1;
                        }
                        break;

                    case 0x07: a = value; break;
                }

                return;
            }

            return;

        } // endif (prefix_bit)

        if (opcode == 0) {
            // NOP                  ( 4 )

            return;
        }

        // 01xxxxxx
        if ( ( opcode & 0xc0 ) == 0x40 ) {
            // LD r, r'             ( 4 )
            // LD r, (HL)           ( 7 )
            // LD (HL), r           ( 7 )
            // LD r, (IX + d)       ( 4 + 4 + 3 + 3 ) + 5
            // LD r, (IY + d)       ( 4 + 4 + 3 + 3 ) + 5
            // LD (IX + d), r       ( 4 + 4 + 3 + 3 ) + 5
            // LD (IY + d), r       ( 4 + 4 + 3 + 3 ) + 5
            // HALT                 ( 4 )
            // + недокументированные

            var r_dst = (opcode >> 3) & 0x07;
            var r_src = opcode & 0x07;    

            if ( r_src == 0x06 && r_dst == 0x06 ) {
                // HALT
                pc = ( pc - 1 ) & 0xffff;

                // ( 4 )

                return;
            }

            var value;
            switch (r_src) {
                case 0x00: value = regs.b; break;
                case 0x01: value = regs.c; break;
                case 0x02: value = regs.d; break;
                case 0x03: value = regs.e; break;
                case 0x04: 
                    if (prefix_ix && r_dst != 0x06) {
                        value = get_ix_h();
                    }
                    else if (prefix_iy && r_dst != 0x06) {
                        value = get_iy_h();
                    }
                    else {
                        value = regs.h; 
                    }
                    break;

                case 0x05: 
                    if (prefix_ix && r_dst != 0x06) {
                        value = get_ix_l();
                    }
                    else if (prefix_iy && r_dst != 0x06) {
                        value = get_iy_l();
                    }
                    else {
                        value = regs.l; 
                    }
                    break;

                case 0x06:
                    var addr;
                    if (prefix_ix) {
                        var offset = byte_to_svalue(read_operand_byte());
                        addr = (ix + offset) & 0xffff;

                        ts_cnt += 5;
                    }
                    else if (prefix_iy) {
                        var offset = byte_to_svalue(read_operand_byte());
                        addr = (iy + offset) & 0xffff;

                        ts_cnt += 5;
                    }
                    else {
                        addr = get_hl();
                    }
                    value = mem_byte(addr); 
                    break;

                case 0x07: value = a; break;
            }

            switch (r_dst) {
                case 0x00: regs.b = value; break;
                case 0x01: regs.c = value; break;
                case 0x02: regs.d = value; break;
                case 0x03: regs.e = value; break;
                case 0x04: 
                    if (prefix_ix && r_src != 0x06) {
                        set_ix_h(value);
                    }
                    else if (prefix_iy && r_src != 0x06) {
                        set_iy_h(value);
                    }
                    else {
                        regs.h = value;
                    }
                    break;

                case 0x05: 
                    if (prefix_ix && r_src != 0x06) {
                        set_ix_l(value);
                    }
                    else if (prefix_iy && r_src != 0x06) {
                        set_iy_l(value);
                    }
                    else {
                        regs.l = value;
                    }
                    break;

                case 0x06: 
                    var addr;
                    if (prefix_ix) {
                        var offset = byte_to_svalue(read_operand_byte());
                        addr = (ix + offset) & 0xffff;

                        ts_cnt += 5;
                    }
                    else if (prefix_iy) {
                        var offset = byte_to_svalue(read_operand_byte());
                        addr = (iy + offset) & 0xffff;

                        ts_cnt += 5;
                    }
                    else {
                        addr = get_hl();
                    }
                    mem_byte(addr, value);
                    break;

                case 0x07: a = value; break;
            }

            return;
        }

        // 00xxx110
        if ( ( opcode & 0xc7 ) == 0x06 ) {
            // LD r, n              ( 4 + 3 )
            // LD (HL), n           ( 4 + 3 + 3 )
            // LD (IX + d), n       ( 4 + 4 + 3 + 3 ) + 5
            // LD (IY + d), n       ( 4 + 4 + 3 + 3 ) + 5
            // + недокументированные

            var r_dst = (opcode >> 3) & 0x07;

            switch (r_dst) {
                case 0x00: regs.b = read_operand_byte(); break;
                case 0x01: regs.c = read_operand_byte(); break;
                case 0x02: regs.d = read_operand_byte(); break;
                case 0x03: regs.e = read_operand_byte(); break;
                case 0x04: 
                    if (prefix_ix) {
                        set_ix_h(read_operand_byte());
                    }
                    else if (prefix_iy) {
                        set_iy_h(read_operand_byte());
                    }
                    else {
                       regs.h = read_operand_byte();
                    }
                    break;

                case 0x05: 
                    if (prefix_ix) {
                        set_ix_l(read_operand_byte()); 
                    }
                    else if (prefix_iy) {
                        set_iy_l(read_operand_byte()); 
                    }
                    else {
                        regs.l = read_operand_byte();
                    }
                    break;

                case 0x06: 
                    var addr;
                    if (prefix_ix) {
                        var offset = byte_to_svalue(read_operand_byte());
                        addr = (ix + offset) & 0xffff;

                        ts_cnt += 5;
                    }
                    else if (prefix_iy) {
                        var offset = byte_to_svalue(read_operand_byte());
                        addr = (iy + offset) & 0xffff;

                        ts_cnt += 5;
                    }
                    else {
                        addr = get_hl();
                    }                    
                    mem_byte(addr, read_operand_byte()); 
                    break;

                case 0x07: a = read_operand_byte(); break;
            }

            return;
        }

        // 00xxx010
        if ( (opcode & 0xc7 ) == 0x02 ) {
            // LD A, (BC)           ( 4 + 3 )
            // LD A, (DE)           ( 4 + 3 )
            // LD A, (nn)           ( 4 + 3 + 3 + 3 )
            // LD HL, (nn)          ( 4 + 3 + 3 + 3 + 3 )
            // LD IX, (nn)          ( 4 + 4 + 3 + 3 + 3 + 3 )
            // LD IY, (nn)          ( 4 + 4 + 3 + 3 + 3 + 3 )

            // LD (BC), A           ( 4 + 3 )
            // LD (DE), A           ( 4 + 3 )
            // LD (nn), A           ( 4 + 3 + 3 + 3 )
            // LD (nn), HL          ( 4 + 3 + 3 + 3 + 3 )
            // LD (nn), IX          ( 4 + 4 + 3 + 3 + 3 + 3 )
            // LD (nn), IY          ( 4 + 4 + 3 + 3 + 3 + 3 )

            var to_reg = !!(opcode & 0x08);
            var r_code = (opcode >> 4) & 0x03;

            if (to_reg) {
                switch (r_code) {
                    case 0x00: 
                        // A, (BC)
                        a = mem_byte(get_bc());
                        break;

                    case 0x01:
                        // A, (DE)
                        a = mem_byte(get_de());
                        break;

                    case 0x02:
                        // HL, (nn)
                        var addr = read_operand_word();
                        var value = mem_word(addr);
                        if (prefix_ix) {
                            ix = value;
                        }
                        else if (prefix_iy) {
                            iy = value;
                        }
                        else {
                            set_hl(value);
                        }
                        break;

                    case 0x03:
                        // A, (nn)
                        var addr = read_operand_word();
                        a = mem_byte(addr);
                        break;
                }
            }
            else {
                switch (r_code) {
                    case 0x00:
                        // (BC), A
                        mem_byte(get_bc(), a);
                        break;

                    case 0x01:
                        // (DE), A
                        mem_byte(get_de(), a);
                        break;

                    case 0x02:
                        // (nn), HL
                        var value;
                        if (prefix_ix) {
                            value = ix;
                        }
                        else if (prefix_iy) {
                            value = iy;
                        }
                        else {
                            value = get_hl();
                        }

                        var addr = read_operand_word();
                        mem_word(addr, value);
                        break;

                    case 0x03:
                        // (nn), A
                        var addr = read_operand_word();
                        mem_byte(addr, a);
                        break;
                }
            }

            return;
        }

        // 00xx0001
        if ( ( opcode & 0xcf ) == 0x01 ) {
            // LD dd, nn        ( 4 + 3 + 3 )
            // LD IX, nn        ( 4 + 4 + 3 + 3 )
            // LD IY, nn        ( 4 + 4 + 3 + 3 )

            var value = read_operand_word();

            var dd = (opcode >> 4) & 0x03;
            switch (dd) {
                case 0x00: set_bc(value); break;
                case 0x01: set_de(value); break;
                case 0x02: 
                    if (prefix_ix) {
                        ix = value;
                    }
                    else if (prefix_iy) {
                        iy = value;
                    }
                    else {
                        set_hl(value); 
                    }
                    break;

                case 0x03: sp = value; break;
            }

            return;
        }

        // 11xx0x01
        if ( (opcode & 0xcb) == 0xc1 ) {
            // PUSH qq          ( 4 + 3 + 3 ) + 1
            // PUSH IX          ( 4 + 4 + 3 + 3 ) + 1
            // PUSH IY          ( 4 + 4 + 3 + 3 ) + 1
            // POP qq           ( 4 + 3 + 3 )
            // POP IX           ( 4 + 4 + 3 + 3 )
            // POP IY           ( 4 + 4 + 3 + 3 )

            var to_reg = !(opcode & 0x04);
            var qq = (opcode >> 4) & 0x03;


            if (to_reg) {
                var value = mem_word(sp);
                sp = ( sp + 2 ) & 0xffff;

                switch (qq) {
                    case 0x00: set_bc(value); break;
                    case 0x01: set_de(value); break;
                    case 0x02:
                        if (prefix_ix) {
                            ix = value;
                        }
                        else if (prefix_iy) {
                            iy = value;
                        }
                        else {
                            set_hl(value);
                        }
                        break;

                    case 0x03: set_af(value); break;
                }
            }
            else {
                var value;
                switch (qq) {
                    case 0x00: value = get_bc(); break;
                    case 0x01: value = get_de(); break;
                    case 0x02:
                        if (prefix_ix) {
                            value = ix;
                        }
                        else if (prefix_iy) {
                            value = iy;
                        }
                        else {
                            value = get_hl();
                        }
                        break;

                    case 0x03:
                        value = get_af();
                        break;
                }

                sp = ( sp - 2 ) & 0xffff;
                mem_word(sp, value);

                ts_cnt += 1;
            }

            return;
        }

        // 11111001
        if ( opcode == 0xf9 ) {
            // LD SP, HL        ( 4 ) + 2
            // LD SP, IX        ( 4 + 4 ) + 2
            // LD SP, IY        ( 4 + 4 ) + 2

            if (prefix_ix) {
                sp = ix;
            }
            else if (prefix_iy) {
                sp = iy;
            }
            else {
                sp = get_hl();
            }

            ts_cnt += 2;

            return;
        }

        if ( opcode == 0xeb ) {
            // EX DE, HL        ( 4 )
            var value = get_hl();
            set_hl(get_de());
            set_de(value);
            return;
        }

        if ( opcode == 0x08 ) {
            // EX AF, AF'       ( 4 )
            var t = a;
            a = a_;
            a_ = t;

            t = f;
            f = f_;
            f_ = t;
            return;
        }

        if ( opcode == 0xd9 ) {
            // EXX              ( 4 )
            var t = regs;
            regs = regs_;
            regs_ = t;
            return;
        }

        if ( opcode == 0xe3 ) {
            // EX (SP), HL      ( 4 + 3 + 3 + 3 + 3 ) + 3
            // EX (SP), IX      ( 4 + 4 + 3 + 3 + 3 + 3 ) + 3
            // EX (SP), IY      ( 4 + 4 + 3 + 3 + 3 + 3 ) + 3

            var value = mem_word(sp);
            if (prefix_ix) {
                mem_word(sp, ix);
                ix = value;
            }
            else if (prefix_iy) {
                mem_word(sp, iy);
                iy = value;
            }
            else {
                mem_word(sp, get_hl());
                set_hl(value);
            }

            ts_cnt += 3;

            return;
        }

        // 10xxxxxx and 11xxx110
        if ( ( opcode & 0xc0 ) == 0x80 || ( opcode & 0xc7 ) == 0xc6 ) {
            // ADD A, r         ( 4 )
            // ADD A, n         ( 4 + 3 )
            // ADD A, (HL)      ( 4 + 3 )
            // ADD A, (IX + d)  ( 4 + 4 + 3 + 3 ) + 5
            // ADD A, (IY + d)  ( 4 + 4 + 3 + 3 ) + 5
            // ADC A, r         -//-
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
                operand = read_operand_byte(); // n
            }
            else {
                var r1 = opcode & 0x07;
                switch (r1) {
                    case 0x00: operand = regs.b; break; // B
                    case 0x01: operand = regs.c; break; // C
                    case 0x02: operand = regs.d; break; // D
                    case 0x03: operand = regs.e; break; // E
                    case 0x04: 
                        if (prefix_ix) {
                            operand = get_ix_h(); // IXh
                        }
                        else if (prefix_iy) {
                            operand = get_iy_h(); // IYh
                        }
                        else {
                            operand = regs.h; // H
                        }
                        break;

                    case 0x05: 
                        if (prefix_ix) {    
                            operand = get_ix_l(); // IXl
                        }
                        else if (prefix_iy) {
                            operand = get_iy_l(); // IYl
                        }
                        else {
                            operand = regs.l; // L
                        }
                        break;

                    case 0x06:
                        if (prefix_ix) {
                            var offset = byte_to_svalue(read_operand_byte()); // (IX + d)
                            operand = mem_byte((ix + offset) & 0xffff);

                            ts_cnt += 5;
                        }
                        else if (prefix_iy) {
                            var offset = byte_to_svalue(read_operand_byte()); // (IY + d)
                            operand = mem_byte((iy + offset) & 0xffff);

                            ts_cnt += 5;
                        }
                        else {
                            operand = mem_byte(get_hl()); // (HL)
                        }
                        break;

                    case 0x07: operand = a; break; // A
                }
            }

            var logic = !!(opcode & 0x20);
            if (logic) { // logic
                var subcode = (opcode >> 3) & 0x03;

                switch (subcode) {
                    case 0x00:
                        // AND
                        a &= operand;
                        f.s = a & 0x80;
                        f.z = !a;
                        f.y = a & 0x20;
                        f.h = 1;
                        f.x = a & 0x08;
                        f.p = get_parity(a);
                        f.n = 0;
                        f.c = 0;
                        break;

                    case 0x01:
                        // XOR
                        a ^= operand;
                        f.s = a & 0x80;
                        f.z = !a;
                        f.y = a & 0x20;
                        f.h = 0;
                        f.x = a & 0x08;
                        f.p = get_parity(a);
                        f.n = 0;
                        f.c = 0;
                        break;

                    case 0x02:
                        // OR
                        a |= operand;
                        f.s = a & 0x80;
                        f.z = !a;
                        f.y = a & 0x20;
                        f.h = 0;
                        f.x = a & 0x08;
                        f.p = get_parity(a);
                        f.n = 0;
                        f.c = 0;
                        break;

                    case 0x03:
                        // CP
                        var diff = a - operand;
                        var borrow = diff < 0;
                        diff &= 0xff;

                        // при выполнении CP флаги X и Y устанавливаются на основе аргумента, а не результата
                        f.s = diff & 0x80;
                        f.z = !diff;
                        f.y = operand & 0x20;
                        f.h = (a & 0x0f) - (operand & 0x0f) < 0;
                        f.x = operand & 0x08;
                        f.p = get_byte_diff_overflow(a, operand, diff);
                        f.n = 1;
                        f.c = borrow;
                        break;
                }
            }
            else { // arithmetic
                var care_case = !!(opcode & 0x08);
                if (care_case && f.c) {
                    operand++;
                }

                var addition = !(opcode & 0x10);

                if (addition) {
                    var old_a = a;
                    a += operand;
                    var care = a & 0x100;
                    a &= 0xff;

                    f.s = a & 0x80;
                    f.z = !a;
                    f.y = a & 0x20;
                    f.h = ((old_a & 0x0f) + (operand & 0x0f)) & 0x10;
                    f.x = a & 0x08;
                    f.p = get_byte_sum_overflow(old_a, operand, a);
                    f.n = 0;
                    f.c = care;
                }
                else { // subtraction
                    var old_a = a;
                    a -= operand;
                    var borrow = a < 0;
                    a &= 0xff;

                    f.s = a & 0x80;
                    f.z = !a;
                    f.y = a & 0x20;
                    f.h = (old_a & 0x0f) - (operand & 0x0f) < 0;
                    f.x = a & 0x08;
                    f.p = get_byte_diff_overflow(old_a, operand, a);
                    f.n = 1;
                    f.c = borrow;
                }
            }
            return;
        }

        // 00xxx10x
        if ( (opcode & 0xc6 ) == 0x04 ) {
            // INC r            ( 4 )
            // INC (HL)         ( 4 + 3 + 3 ) + 1
            // INC (IX + d)     ( 4 + 4 + 3 + 3 + 3 ) + 6
            // INC (IY + d)     ( 4 + 4 + 3 + 3 + 3 ) + 6
            // DEC r            -//-
            // DEC (HL)
            // DEC (IX + d)
            // DEC (IY + d)
            // + недокументированные

            var r1 = (opcode >> 3) & 0x07;
            var cmd_inc = !(opcode & 0x01);
            if (cmd_inc) {
                var operand;
                var result;
                switch (r1) {
                    case 0x00:
                        // B
                        operand = regs.b;
                        result = (operand + 1) & 0xff;
                        regs.b = result;
                        break;

                    case 0x01:
                        // C
                        operand = regs.c;
                        result = (operand + 1) & 0xff;
                        regs.c = result;
                        break;

                    case 0x02:
                        // D
                        operand = regs.d;
                        result = (operand + 1) & 0xff;
                        regs.d = result;
                        break;

                    case 0x03:
                        // E
                        operand = regs.e;
                        result = (operand + 1) & 0xff;
                        regs.e = result;
                        break;

                    case 0x04:
                        if (prefix_ix) {
                            // IXh
                            operand = get_ix_h();
                            result = (operand + 1) & 0xff;
                            set_ix_h(result);
                        }
                        else if (prefix_iy) {
                            // IYh
                            operand = get_iy_h();
                            result = (operand + 1) & 0xff;
                            set_iy_h(result);
                        }
                        else {
                            // H
                            operand = regs.h;
                            result = (operand + 1) & 0xff;
                            regs.h = result;
                        }
                        break;

                    case 0x05:
                        if (prefix_ix) {
                            // IXl
                            operand = get_ix_l();
                            result = (operand + 1) & 0xff;
                            set_ix_l(result);
                        }
                        else if (prefix_iy) {
                            // IYl
                            operand = get_iy_l();
                            result = (operand + 1) & 0xff;
                            set_iy_l(result);
                        }
                        else {
                            // L
                            operand = regs.l;
                            result = (operand + 1) & 0xff;
                            regs.l = result;
                        }
                        break;   

                    case 0x06:
                        var addr;
                        if (prefix_ix) {
                            // (IX + d)
                            addr = ( ix + byte_to_svalue(read_operand_byte()) ) & 0xffff;

                            ts_cnt += 6;
                        }
                        else if (prefix_iy) {
                            // (IY + d)
                            addr = ( iy + byte_to_svalue(read_operand_byte()) ) & 0xffff;

                            ts_cnt += 6;
                        }
                        else {
                            // (HL)
                            addr = get_hl();

                            ts_cnt += 1;
                        }

                        operand = mem_byte(addr);
                        result = (operand + 1) & 0xff;
                        mem_byte(addr, result);
                        break;

                    case 0x07:
                        // A
                        operand = a;
                        result = (operand + 1) & 0xff;
                        a = result;
                        break;                            
                }

                f.s = result & 0x80;
                f.z = !result;
                f.y = result & 0x20;
                f.h = (operand & 0x0f) == 0x0f;
                f.x = result & 0x08;
                f.p = operand == 0x7f;
                f.n = 0;
            }
            else {
                var operand;
                var result;
                switch (r1) {
                    case 0x00:
                        // B
                        operand = regs.b;
                        result = (operand - 1) & 0xff;
                        regs.b = result;
                        break;

                    case 0x01:
                        // C
                        operand = regs.c;
                        result = (operand - 1) & 0xff;
                        regs.c = result;
                        break;

                    case 0x02:
                        // D
                        operand = regs.d;
                        result = (operand - 1) & 0xff;
                        regs.d = result;
                        break;

                    case 0x03:
                        // E
                        operand = regs.e;
                        result = (operand - 1) & 0xff;
                        regs.e = result;
                        break;

                    case 0x04:
                        if (prefix_ix) {
                            // IXh
                            operand = get_ix_h();
                            result = (operand - 1) & 0xff;
                            set_ix_h(result);
                        }
                        else if (prefix_iy) {
                            // IYh
                            operand = get_iy_h();
                            result = (operand - 1) & 0xff;
                            set_iy_h(result);
                        }
                        else {
                            // H
                            operand = regs.h;
                            result = (operand - 1) & 0xff;
                            regs.h = result;
                        }
                        break;

                    case 0x05:
                        if (prefix_ix) {
                            // IXl
                            operand = get_ix_l();
                            result = (operand - 1) & 0xff;
                            set_ix_l(result);
                        }
                        else if (prefix_iy) {
                            // IYl
                            operand = get_iy_l();
                            result = (operand - 1) & 0xff;
                            set_iy_l(result);
                        }
                        else {
                            // L
                            operand = regs.l;
                            result = (operand - 1) & 0xff;
                            regs.l = result;
                        }
                        break;   

                    case 0x06:
                        var addr;
                        if (prefix_ix) {
                            // (IX + d)
                            addr = ( ix + byte_to_svalue(read_operand_byte()) ) & 0xffff;

                            ts_cnt += 6;
                        }
                        else if (prefix_iy) {
                            // (IY + d)
                            addr = ( iy + byte_to_svalue(read_operand_byte()) ) & 0xffff;

                            ts_cnt += 6;
                        }
                        else {
                            // (HL)
                            addr = get_hl();

                            ts_cnt += 1;
                        }      
                        
                        operand = mem_byte(addr);
                        result = (operand - 1) & 0xff;
                        mem_byte(addr, result);                                      
                        break;

                    case 0x07:
                        // A
                        operand = a;
                        result = (operand - 1) & 0xff;
                        a = result;
                        break;                            
                }

                f.s = result & 0x80;
                f.z = !result;
                f.y = result & 0x20;
                f.h = !(operand & 0x0f);
                f.x = result & 0x08;
                f.p = operand == 0x80;
                f.n = 1;
            }

            return;
        }

        // 1111x011
        if ( (opcode & 0xf7 ) == 0xf3 ) {
            // DI           ( 4 )
            // EI           ( 4 )

            var allow_int = !!(opcode & 0x08);
            flag_iff1(allow_int);
            flag_iff2(allow_int);
            return;
        }

        // 00100111
        if ( opcode == 0x27 ) {
            // DAA          ( 4 )

            var a_l = a & 0x0f;
            var a_h = a >> 4;

            if ( f.n ) {
                // after subtraction
                if ( f.h || a_l > 9 ) {
                    a_l -= 6;
                    if ( a_l < 0 ) {
                        f.h = 1;
                        a_l &= 0x0f;
                        a_h -= 1;
                    }
                }

                if ( f.c || a_h > 9 || a_h < 0 ) {
                    a_h -= 6;
                    if ( a_h < 0 ) {
                        f.c = 1;
                        a_h &= 0x0f;
                    }
                }
            }
            else {
                // after addition
                if ( f.h || a_l > 9 ) {
                    a_l += 6;
                    if ( a_l & 0x10 ) {
                        f.h = 1;
                        a_l &= 0x0f;
                        a_h += 1;
                    }
                }

                if ( f.c || a_h > 9 ) {
                    a_h += 6;
                    if ( a_h & 0x10 ) {
                        f.c = 1;
                        a_h &= 0x0f;
                    }
                }
            }

            a = ( a_h << 4 ) | a_l;

            f.s = a & 0x80;
            f.z = !a;
            f.y = a & 0x20;
            f.x = a & 0x08;
            f.p = get_parity(a);

            return;
        }

        // 00101111
        if ( opcode == 0x2f ) {
            // CPL          ( 4 )

            a ^= 0xff;
            f.y = a & 0x20;
            f.h = 1;
            f.x = a & 0x08;
            f.n = 1;
            return;
        }

        // 00111111
        if ( opcode == 0x3f ) {
            // CCF          ( 4 )

            f.y = a & 0x20;
            f.h = f.c;
            f.x = a & 0x08;
            f.n = 0;
            f.c = !f.c;
            return;
        }

        // 00110111
        if ( opcode == 0x37 ) {
            // SCF          ( 4 )

            f.y = a & 0x20;
            f.h = 0;
            f.x = a & 0x08;
            f.n = 0;
            f.c = 1;
            return;
        }

        // 00xx1001
        if ( ( opcode & 0xcf ) == 0x09 ) {
            // ADD HL, ss   ( 4 ) + 7
            // ADD IX, pp   ( 4 + 4 ) + 7
            // ADD IY, rr   ( 4 + 4 ) + 7

            var ss = (opcode >> 4) & 0x03;
            var operand;
            switch (ss) {
                case 0x00: operand = get_bc(); break; // BC
                case 0x01: operand = get_de(); break; // DE
                case 0x02:
                    if (prefix_ix) {
                        operand = ix; // IX
                    }
                    else if (prefix_iy) {
                        operand = iy; // IY
                    }
                    else {
                        operand = get_hl(); // HL
                    }
                    break;

                case 0x03: operand = sp; break; // SP
            }

            var current;
            if (prefix_ix) {
                current = ix;
            }
            else if (prefix_iy) {
                current = iy;
            }
            else {
                current = get_hl();
            }

            var result = current + operand;
            var care = result & 0x10000;
            result &= 0xffff;

            if (prefix_ix) {
                ix = result;
            }
            else if (prefix_iy) {
                iy = result;
            }
            else {
                set_hl(result);
            }

            f.y = result & 0x2000;
            f.h = ((current & 0x0fff) + (operand & 0x0fff)) & 0x1000;
            f.x = result & 0x0800;
            f.n = 0;
            f.c = care;

            ts_cnt += 7;

            return;
        }

        // 00xxx011
        if ( (opcode & 0xc7 ) == 0x03 ) {
            // INC ss       ( 4 ) + 2
            // INC IX       ( 4 + 4 ) + 2
            // INC IY       ( 4 + 4 ) + 2
            // DEC ss       -//-
            // DEC IX
            // DEC IY

            var cmd_inc = !(opcode & 0x08);
            var ss = (opcode >> 4) & 0x03;

            if (cmd_inc) {
                switch (ss) {
                    case 0x00: set_bc(( get_bc() + 1 ) & 0xffff ); break; // BC
                    case 0x01: set_de(( get_de() + 1 ) & 0xffff ); break; // DE
                    case 0x02:
                        if (prefix_ix) {
                            ix = ( ix + 1 ) & 0xffff; // IX
                        }
                        else if (prefix_iy) {
                            iy = ( iy + 1 ) & 0xffff; // IY
                        }
                        else {
                            set_hl(( get_hl() + 1 ) & 0xffff ); // HL
                        }
                        break;

                    case 0x03: sp = ( sp + 1 ) & 0xffff; break; // SP
                }
            }
            else {
                switch (ss) {
                    case 0x00: set_bc(( get_bc() - 1 ) & 0xffff ); break; // BC
                    case 0x01: set_de(( get_de() - 1 ) & 0xffff ); break; // DE
                    case 0x02:
                        if (prefix_ix) {
                            ix = ( ix - 1 ) & 0xffff; // IX
                        }
                        else if (prefix_iy) {
                            iy = ( iy - 1 ) & 0xffff; // IY
                        }
                        else {
                            set_hl(( get_hl() - 1 ) & 0xffff ); // HL
                        }
                        break;

                    case 0x03: sp = ( sp - 1 ) & 0xffff; break; // SP
                }
            }

            ts_cnt += 2;

            return;
        }

        // 000xx111
        if ( (opcode & 0xe7 ) == 0x07 ) {
            // RLCA         ( 4 )
            // RLA          ( 4 )
            // RRCA         ( 4 )
            // RRA          ( 4 )

            var left = !(opcode & 0x08);
            var without_c = !(opcode & 0x10); // постфикс C указывает, что флаг C не участвует в ротации!

            var extra;
            if (left) {
                extra = !!(a & 0x80);
                a = ( a << 1 ) & 0xff;
                if ((!without_c && f.c) || (without_c && extra)) {
                    a |= 0x01;
                }
            }
            else {
                extra = !!(a & 0x01);
                a = ( a >> 1 );
                if ((!without_c && f.c) || (without_c && extra)) {
                    a |= 0x80;
                }
            }

            f.y = a & 0x20;
            f.h = 0;
            f.x = a & 0x08;
            f.n = 0;
            f.c = extra;

            return;
        }

        // 11000011
        if ( opcode == 0xc3 ) {
            // JP nn        ( 4 + 3 + 3 )

            var addr = read_operand_word();
            pc = addr;
            return;
        }

        // 11xxx010
        if ( ( opcode & 0xc7 ) == 0xc2 ) {
            // JP cc, nn    ( 4 + 3 + 3 )

            var condition_code = (opcode >> 3) & 0x07;

            var condition;
            switch (condition_code) {
                case 0x00: condition = !f.z; break; // NZ
                case 0x01: condition = f.z; break; // Z
                case 0x02: condition = !f.c; break; // NC
                case 0x03: condition = f.c; break; // C
                case 0x04: condition = !f.p; break; // PO
                case 0x05: condition = f.p; break; // PE
                case 0x06: condition = !f.s; break; // P
                case 0x07: condition = f.s; break; // M
            }

            var addr = read_operand_word();
            if ( condition ) {
                pc = addr;
            }

            return;
        }

        // 00xxx000 where xxx >= 010
        if ( ( opcode & 0xc7 ) == 0x00 && ( opcode & 0x38 ) >= 0x10 ) {
            // JR e         ( 4 + 3 ) + 5
            // JR C, e      ( 4 + 3 ) + 5?
            // JR NC, e     ( 4 + 3 ) + 5?
            // JR Z, e      ( 4 + 3 ) + 5?
            // JR NZ, e     ( 4 + 3 ) + 5?
            // DJNZ e       ( 4 + 3 ) + 1 + 5?

            var condition_code = (opcode >> 3) & 0x07;

            var condition;
            switch (condition_code) {
                case 0x02:
                    // DJNZ e
                    regs.b = ( regs.b - 1 ) & 0xff;
                    condition = !!regs.b; // B != 0

                    ts_cnt += 1;
                    break;

                case 0x03: condition = true; break; // JR e
                case 0x04: condition = !f.z; break; // JR NZ, e
                case 0x05: condition = f.z; break; // JR Z, e
                case 0x06: condition = !f.c; break; // JR NC, e
                case 0x07: condition = f.c; break; // JR C, e
            }

            var offset = byte_to_svalue(read_operand_byte());
            if ( condition ) {
                pc = ( pc + offset ) & 0xffff;
                ts_cnt += 5;
            }

            return;
        }

        // 11101001
        if ( opcode == 0xe9 ) {
            // JP (HL)      ( 4 )
            // JP (IX)      ( 4 + 4 )
            // JP (IY)      ( 4 + 4 )
            // * это не косвенная адресация, читать мнемонику без скобок!

            if (prefix_ix) {
                pc = ix;
            }
            else if (prefix_iy) {
                pc = iy;
            }
            else {
                pc = get_hl();
            }

            return;
        }

        // 11001101
        if ( opcode == 0xcd ) {
            // CALL nn      ( 4 + 3 + 3 + 3 + 3 ) + 1

            var addr = read_operand_word();

            sp = ( sp - 2 ) & 0xffff;
            mem_word(sp, pc);
            pc = addr;

            ts_cnt += 1;

            return;
        }

        // 11xxx100
        if ( ( opcode & 0xc7 ) == 0xc4 ) {
            // CALL cc, nn  ( 4 + 3 + 3 + 3? + 3? ) + 1?

            var condition_code = (opcode >> 3) & 0x07;

            var condition;
            switch (condition_code) {
                case 0x00: condition = !f.z; break; // NZ
                case 0x01: condition = f.z; break; // Z
                case 0x02: condition = !f.c; break; // NC
                case 0x03: condition = f.c; break; // C
                case 0x04: condition = !f.p; break; // PO
                case 0x05: condition = f.p; break; // PE
                case 0x06: condition = !f.s; break; // P
                case 0x07: condition = f.s; break; // M
            }

            var addr = read_operand_word();

            if ( condition ) {
                sp = ( sp - 2 ) & 0xffff;
                mem_word(sp, pc);
                pc = addr;

                ts_cnt += 1;
            }

            return;
        }

        // 11001001
        if ( opcode == 0xc9 ) {
            // RET          ( 4 + 3 + 3 )

            pc = mem_word(sp);
            sp = ( sp + 2 ) & 0xffff;
            return;
        }

        // 11xxx000
        if ( ( opcode & 0xc7 ) == 0xc0 ) {
            // RET cc       ( 4 + 3? + 3? ) + 1

            var condition_code = (opcode >> 3) & 0x07;

            var condition;
            switch (condition_code) {
                case 0x00: condition = !f.z; break; // NZ
                case 0x01: condition = f.z; break; // Z
                case 0x02: condition = !f.c; break; // NC
                case 0x03: condition = f.c; break; // C
                case 0x04: condition = !f.p; break; // PO
                case 0x05: condition = f.p; break; // PE
                case 0x06: condition = !f.s; break; // P
                case 0x07: condition = f.s; break; // M
            }

            if ( condition ) {
                pc = mem_word(sp);
                sp = ( sp + 2 ) & 0xffff;
            }

            ts_cnt += 1;

            return;
        }

        // 11xxx111
        if ( (opcode & 0xc7 ) == 0xc7 ) {
            // RST p        ( 4 + 3 + 3 ) + 1

            var rst_code = (opcode >> 3) & 0x07;
            var addr = rst_code << 3; // code * 8

            sp = ( sp - 2 ) & 0xffff;
            mem_word(sp, pc);
            pc = addr;

            ts_cnt += 1;

            return;
        }

        // 1101x011
        if ( ( opcode & 0xf7 ) == 0xd3 ) {
            // IN A, (n)    ( 4 + 3 + 4 )
            // OUT (n), A   ( 4 + 3 + 4 )

            var port_low = read_operand_byte();
            var port_high = a;
            var port = (port_high << 8) | port_low;

            var cmd_in = !!(opcode & 0x08);
            if (cmd_in) {
                // IN
                a = io_byte(port);
            }
            else {
                // OUT
                io_byte(port, a);
            }

            return;
        }        
    }

    /////////////////////////////
    // вспомогательные функции //
    /////////////////////////////

    function byte_to_svalue( value ) {
        if ( value & 0x80 ) {
            return -((value ^ 0xff) + 1);
        }
        else {
            return value;
        }
    }

    function get_parity(value) {
        var parity = true;
        while (value) {
            if (value & 1) {
                parity = !parity;
            }

            value = value >> 1;
        }
        return parity;
    }

    function get_byte_sum_overflow(op1, op2, sum) {
        if ((op1 ^ op2) & 0x80) {
            return false;
        }
        else {
            if ((op1 ^ sum) & 0x80) {
                return true;
            }
            else {
                return false;
            }
        }
    }

    function get_byte_diff_overflow(op1, op2, diff) {
        if ((op1 ^ op2) & 0x80) {
            if ((op1 ^ diff) & 0x80) {
                return true;
            }
            else {
                return false;
            }
        }
        else {
            return false;
        }
    }

    function get_word_sum_overflow(op1, op2, sum) {
        if ((op1 ^ op2) & 0x8000) {
            return false;
        }
        else {
            if ((op1 ^ sum) & 0x8000) {
                return true;
            }
            else {
                return false;
            }
        }        
    }

    function get_word_diff_overflow(op1, op2, diff) {
        if ((op1 ^ op2) & 0x8000) {
            if ((op1 ^ diff) & 0x8000) {
                return true;
            }
            else {
                return false;
            }
        }
        else {
            return false;
        }
    }

    ////////////////////////////////
    // функции запроса прерываний //
    ////////////////////////////////

    function nmirq() {
        nmi_request = true;
    }  

    function intrq(data) {
        int_request = true;
        int_request_data = (data !== undefined) ? (data & 0xff) : 0xff;
    }

    ////////////////////
    // функция сброса //
    ////////////////////

    function reset() {
        flag_iff1(false);
        flag_iff2(false);
        int_request = false;
        nmi_request = false;
        pc = 0x0000;
        i = 0;
        r = 0;
        imf = 0x00; // IM 0
        sp = 0xffff;
        a = 0xff;
        f.set(0xff);
        a_ = 0xff;
        f_.set(0xff);
        prefix_ix = false;
        prefix_iy = false;
        prefix_ext = false;
        prefix_bit = false;
    }

    ///////////////////////////////////
    // функции для отладки и снимков //
    ///////////////////////////////////

    function get_state() {
        var state = {};

        state.af_ = ( a_ << 8 ) | f_.get();
        state.bc_ = ( regs_.b << 8 ) | regs_.c;
        state.de_ = ( regs_.d << 8 ) | regs_.e;
        state.hl_ = ( regs_.h << 8 ) | regs_.l;

        state.af = ( a << 8 ) | f.get();
        state.bc = ( regs.b << 8 ) | regs.c;
        state.de = ( regs.d << 8 ) | regs.e;
        state.hl = ( regs.h << 8 ) | regs.l;

        state.ix = ix;
        state.iy = iy;

        state.sp = sp;
        state.pc = pc;

        state.r = r;
        state.i = i;

        state.imf = imf;
        state.iff = iff;

        state.prefix_dd = prefix_ix;
        state.prefix_fd = prefix_iy;
        state.prefix_ed = prefix_ext;
        state.prefix_cb = prefix_bit;

        return state;        
    }

    function set_state( state ) {
        a_ = ( state.af_ >> 8 );
        f_.set( state.af_ & 0xff );
        regs.b_ = ( state.bc_ >> 8 );
        regs.c_ = ( state.bc_ & 0xff );
        regs.d_ = ( state.de_ >> 8 );
        regs.e_ = ( state.de_ & 0xff );
        regs.h_ = ( state.hl_ >> 8 );
        regs.l_ = ( state.hl_ & 0xff );

        a = ( state.af >> 8 );
        f.set( state.af & 0xff );
        regs.b = ( state.bc >> 8 );
        regs.c = ( state.bc & 0xff );
        regs.d = ( state.de >> 8 );
        regs.e = ( state.de & 0xff );
        regs.h = ( state.hl >> 8 );
        regs.l = ( state.hl & 0xff );

        ix = state.ix;
        iy = state.iy;

        sp = state.sp;
        pc = state.pc;

        r = state.r;
        i = state.i;

        imf = state.imf;
        iff = state.iff;

        prefix_iy = state.prefix_dd;
        prefix_iy = state.prefix_fd;
        prefix_ext = state.prefix_ed;
        prefix_bit = state.prefix_cb;
    }

    ///////////////////////
    // внешний интерфейс //
    ///////////////////////

    // nmirq();
    // Ставит запрос на немаскируемое прерывание, 
    // который будет обработан при следующем (или
    // после следующем) вызове метода process()
    this.nmirq = nmirq;

    // intrq(data = 0xff);
    // Ставит запрос на маскируемое прерывание.
    // При следующем (или после следующем) вызо-
    // ве метода process(), запрос будет либо
    // удовлетворен, либо отклонен (если маскиру-
    // емые прерывания запрещены в данный момент).
    // Агрумент data - восьмибитное число на шине
    // данных в момент прерывания. Оно использу-
    // ется в режимах прерывания 0 и 2.
    this.intrq = intrq;

    // reset();
    // Заного инициализирует процессор. После
    // сброса устанавливается режим прерываний 0,
    // запрещаются маскируемые прерывания, ре-
    // гистры AF и SP устанавливаются в 0xFFFF,
    // регистры IR и PC устанавливаются в 0x0000.
    // Значение остальных регистров не определено.
    this.reset = reset;

    // process();
    // Считывает очередную инструкцию из памяти и
    // либо выполняет команду, либо устанавливает
    // флаг какого-то из командных префиксов.
    // Также при поступлении запроса на прерывание,
    // выполняется проверка возможности его удовле-
    // творить, и, в случае успеха, выполняется
    // переход в процедуру обработки.
    this.process = process;

    // get_state();
    // Возвращает объект с внутренним состоянием
    // регистров и триггеров процессора
    this.get_state = get_state;

    // set_state( state );
    // Устанавливает внутреннее состояние процессора
    // в соответствии с переданным объектом state:
    // {
    //    af_: ...,
    //    bc_: ...,
    //    de_: ...,
    //    hl_: ...,
    //
    //    af: ...,
    //    bc: ...,
    //    de: ...,
    //    hl: ...,
    //
    //    ix: ...,
    //    iy: ...,
    //
    //    sp: ...,
    //    pc: ...,
    //
    //    r: ...,
    //    i: ...,
    //
    //    imf: ...,
    //    iff: ...,
    //
    //    prefix_dd: ...,
    //    prefix_fd: ...,
    //    prefix_ed: ...,
    //    prefix_cb: ...    
    // }
    this.set_state = set_state;

    this.get_ts_cnt = function() { return ts_cnt; }
    this.set_ts_cnt = function( value ) { ts_cnt = value; }
}