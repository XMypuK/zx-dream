function ZX_Port7FFD() {
	'use strict';

	var _bus;
	var port_value = 0x00;

	function io_write_7ffd(address, data) {
		// if bit 5 is on, the port is locked
		if (!(port_value & 0x20)) {
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
		// в Pentagon128 проверка доступа к порту 
		// идет только по линиям A1, A15
		bus.on_io_write(io_write_7ffd, { mask: 0x8002, value: 0x0000 });
		bus.on_var_write(var_write_port_7ffd_value, 'port_7ffd_value');
		bus.on_var_read(var_read_port_7ffd_value, 'port_7ffd_value');
		bus.on_reset(reset);
	}
}