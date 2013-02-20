function ZX_Settings() {
	this.use_bright_bit = true;
	// интервал в тактах процессора, не ранее которого происходит прерывание
	this.tstates_per_int_min = 70000;
	// количество тактов процессора, после которых выполнение приостанавливается до следующего прерывания
	this.tstates_per_int_max = 70000;

	this.turbo_mode = true;
	this.turbo_tstates_per_int_min = 140000;
	this.turbo_tstates_per_int_max = 140000;
	// интервал в милисекундах, не ранее которого происходит прерывание
	this.int_period = 19;

	this.drive_a = 'Deja Vu #A.trd';
	this.drive_b = '';
	this.drive_c = '';
	this.drive_d = '';
	this.extended_memory = 1;
}

ZX_Settings.get_local_settings = function() {
	var settings = new ZX_Settings();

	if ( localStorage ) {
		settings.use_bright_bit				= value_or_default(localStorage.settings_use_bright_bit,			settings.use_bright_bit);
		settings.tstates_per_int_min		= value_or_default(localStorage.settings_tstates_per_int_min,		settings.tstates_per_int_min);
		settings.tstates_per_int_max		= value_or_default(localStorage.settings_tstates_per_int_max,		settings.tstates_per_int_max);
		settings.turbo_mode					= value_or_default(localStorage.settings_turbo_mode,				settings.turbo_mode);
		settings.turbo_tstates_per_int_min	= value_or_default(localStorage.settings_turbo_tstates_per_int_min,	settings.turbo_tstates_per_int_min);
		settings.turbo_tstates_per_int_max	= value_or_default(localStorage.settings_turbo_tstates_per_int_max,	settings.turbo_tstates_per_int_max);
		settings.int_period					= value_or_default(localStorage.settings_int_period,				settings.int_period);
		settings.drive_a					= value_or_default(localStorage.settings_drive_a,					settings.drive_a);
		settings.drive_b					= value_or_default(localStorage.settings_drive_b,					settings.drive_b);
		settings.drive_c					= value_or_default(localStorage.settings_drive_c,					settings.drive_c);
		settings.drive_d					= value_or_default(localStorage.settings_drive_d,					settings.drive_d);
		settings.extended_memory			= value_or_default(localStorage.settings_extended_memory,			settings.extended_memory);
	}

	return settings;

	function value_or_default( value, def ) {
		if ( value !== undefined ) {
			switch ( typeof def ) {
				case 'number': return +value;
				case 'boolean': return value == 'true';
				default: return value;
			}
		}
		else {
			return def;
		}
	}
};

ZX_Settings.store_local_settings = function( settings ) {
	if ( localStorage ) {
		localStorage.settings_use_bright_bit			= settings.use_bright_bit;
		localStorage.settings_tstates_per_int_min		= settings.tstates_per_int_min;
		localStorage.settings_tstates_per_int_max		= settings.tstates_per_int_max;
		localStorage.settings_turbo_mode				= settings.turbo_mode;
		localStorage.settings_turbo_tstates_per_int_min	= settings.turbo_tstates_per_int_min;
		localStorage.settings_turbo_tstates_per_int_max	= settings.turbo_tstates_per_int_max;
		localStorage.settings_int_period				= settings.int_period;
		localStorage.settings_drive_a					= settings.drive_a;
		localStorage.settings_drive_b					= settings.drive_b;
		localStorage.settings_drive_c					= settings.drive_c;
		localStorage.settings_drive_d					= settings.drive_d;
		localStorage.settings_extended_memory			= settings.extended_memory;
	}
};