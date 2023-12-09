function ZX_Joystick() {
    this.connect = connect;
    this.left = left;
    this.right = right;
    this.up = up;
    this.down = down;
    this.fire = fire;

    var _rom_trdos = false;
    var _value = 0;

    function connect(bus) {
        bus.on_io_read(io_read);
        bus.on_var_write(var_write_rom_trdos, 'rom_trdos');
    }

    function io_read(address) {
        if (!_rom_trdos && (address & 0xFF) == 0x1F) {
            return _value;
        }
    }

    function var_write_rom_trdos(name, value) {
        _rom_trdos = value;
    }

    function left(value) {
        if (value !== undefined) {
            if (value)
                _value |= 0x02;
            else
                _value &= 0xFD;
        }
        else {
            return !!(_value & 0x02);
        }
    }

    function right(value) {
        if (value !== undefined) {
            if (value)
                _value |= 0x01;
            else
                _value &= 0xFE;
        }
        else {
            return !!(_value & 0x01);
        }
    }

    function up(value) {
        if (value !== undefined) {
            if (value)
                _value |= 0x08;
            else
                _value &= 0xF7;
        }
        else {
            return !!(_value & 0x08);
        }
    }

    function down(value) {
        if (value !== undefined) {
            if (value)
                _value |= 0x04;
            else
                _value &= 0xFB;
        }
        else {
            return !!(_value & 0x04);
        }
    }

    function fire(value) {
        if (value !== undefined) {
            if (value)
                _value |= 0x10;
            else
                _value &= 0xEF;
        }
        else {
            return !!(_value & 0x10);
        }
    }
}