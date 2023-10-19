function ZX_Port7FFD() {
	'use strict';

	var _bus;
	var port_value = 0x00;

	function io_write(address, data) {
		var locked = port_value & 0x20;
		if (address == 0x7ffd && !locked) {
			_bus.var_write('port_7ffd_value', data);
		}
	}

	function var_write_port_7ffd_value(name, value) {
		port_value = value;
	}

	function var_read_port_7ffd_value(name) {
		return port_value;
	}

	function reset() {
		_bus.var_write('port_7ffd_value', 0x00);
	}

	this.connect = function (bus) {
		_bus = bus;
		bus.on_io_write(io_write);
		bus.on_var_write(var_write_port_7ffd_value, 'port_7ffd_value');
		bus.on_var_read(var_read_port_7ffd_value, 'port_7ffd_value');
		bus.on_reset(reset);
	}
}