function ZX_KempstonJoystick() {
    this.connect = connect;
    this.set_enable = set_enable;
    this.get_enable = get_enable;
    this.set_value = set_value;
    this.get_value = get_value;
    this.setKeyState = setKeyState;
    this.getKeyState = getKeyState;

    var _rom_trdos = false;
    var _enable = true;
    var _value = 0;

    function connect(bus) {
        bus.on_io_read(io_read_1f, { mask: 0xFF, value: 0x1F });
        bus.on_var_write(var_write_rom_trdos, 'rom_trdos');
    }

    function io_read_1f(address) {
        if (!_rom_trdos) {
            return _value;
        }
    }

    function var_write_rom_trdos(name, value) {
        _rom_trdos = value;
    }

    function set_enable(value) {
        _enable = value;
    }

    function get_enable(value) {
        return _enable;
    }

    function set_value(value) {
        _value = value;
    }

    function get_value() {
        return _value;
    }

    function setKeyState(key, pressed) {
        if (!_enable)
            return;
        
        if (pressed)
            _value |= 1 << key;
        else
            _value &= ~(1 << key);
    }

    function getKeyState(key) {
        return !!(_value & (1 << key));
    }
}