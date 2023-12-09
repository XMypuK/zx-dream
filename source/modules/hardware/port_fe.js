function ZX_PortFE() {
	'use strict';

	var _bus;
	var port_value = 0x00;

	function io_write(address, data) {
		// в Pentagon128 проверка доступа к порту
		// осуществляется только по линии A0
		if (!( address & 0x01 )) {
			_bus.var_write('port_fe_value', data);
		}
	}
	function var_write_port_fe_value(name, value) {
		port_value = value;
	}

	function var_read_port_fe_value(name) {
		return port_value;
	}

	function reset() {
		_bus.var_write('port_fe_value', 0x00);
	}

	this.connect = function (bus) {
		_bus = bus;
		bus.on_io_write(io_write);
		bus.on_var_write(var_write_port_fe_value, 'port_fe_value');
		bus.on_var_read(var_read_port_fe_value, 'port_fe_value');
		bus.on_reset(reset);
	}
}