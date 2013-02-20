function ZX_PortFE() {
	'use strict';

	var port_value = 0x00;

	var dev = new ZX_Device({
		id: 'port_fe',
		reset: function( bus ) {
			bus.set_var('port_fe_value', 0x00);
		},
		iorq: function( state, bus ) {
			if ( state.write && ( state.address & 0xff ) == 0xfe ) {
				bus.set_var('port_fe_value', state.data);
			}
		},
		event: function ( name, options, bus ) {
			if ( name == 'var_changed' && options.name == 'port_fe_value' ) {
				port_value = options.value;
			}
		}
	});

	return dev;
}