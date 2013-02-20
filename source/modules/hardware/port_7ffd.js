function ZX_Port7FFD() {
	'use strict';

	var port_value = 0x00;

	var dev = new ZX_Device({
		id: 'port_7ffd',
		reset: function( bus ) {
			bus.set_var('port_7ffd_value', 0x00);
		},
		iorq: function( state, bus ) {
			var port_locked = port_value & 0x20;

			if ( state.write && state.address == 0x7ffd && !port_locked ) {
				bus.set_var('port_7ffd_value', state.data);
			}
		},
		event: function ( name, options, bus ) {
			if ( name == 'var_changed' && options.name == 'port_7ffd_value' ) {
				port_value = options.value;
			}
		}
	});

	return dev;
}