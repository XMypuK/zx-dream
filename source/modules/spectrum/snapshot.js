function ZX_Snapshot () {
	this.cpuState = {
		af: 0,
		bc: 0,
		de: 0,
		hl: 0,
		af_: 0,
		bc_: 0,
		de_: 0,
		hl_: 0,
		i: 0,
		r: 0,
		ix: 0,
		iy: 0,
		pc: 0,
		sp: 0,
		iff: 0,
		imf: 0
	};

	this.memory = {};
	this.border = 0;
	this.port_7ffd = 0;
	this.trdos = 0;
}

ZX_Snapshot.take = function (bus, cpu) {
	var snapshot = new ZX_Snapshot();
	var cpuState = cpu.get_state();
	snapshot.cpuState.af = cpuState.af;
	snapshot.cpuState.bc = cpuState.bc;
	snapshot.cpuState.de = cpuState.de;
	snapshot.cpuState.hl = cpuState.hl;
	snapshot.cpuState.af_ = cpuState.af_;
	snapshot.cpuState.bc_ = cpuState.bc_;
	snapshot.cpuState.de_ = cpuState.de_;
	snapshot.cpuState.hl_ = cpuState.hl_;
	snapshot.cpuState.i = cpuState.i;
	snapshot.cpuState.ix = cpuState.ix;
	snapshot.cpuState.iy = cpuState.iy;
	snapshot.cpuState.sp = cpuState.sp;
	snapshot.cpuState.iff = cpuState.iff;
	snapshot.cpuState.imf = cpuState.imf;
	if (cpuState.prefix_dd || cpuState.prefix_fd || cpuState.prefix_ed || cpuState.prefix_cb) {
		snapshot.cpuState.r = (cpuState.r & 0x80) | ((cpuState.r - 1) & 0x7f);
		snapshot.cpuState.pc = ((cpuState.pc - 1) & 0xffff);
	}
	else {
		snapshot.cpuState.r = cpuState.r;
		snapshot.cpuState.pc = cpuState.pc;
	}
	var port_7ffd = bus.var_read('port_7ffd_value');
	snapshot.port_7ffd = port_7ffd & 0x3f;
	snapshot.border = bus.var_read('port_fe_value') & 0x07;
	snapshot.trdos = bus.var_read('rom_trdos');
	for ( var page = 0; page < 8; page++ ) {
		bus.var_write('port_7ffd_value', ( port_7ffd & 0xf8 ) | page );
		var memory_page = [];
		for ( var i = 0x0000; i < 0x4000; i++ ) {
			memory_page[i] = bus.mem_read(0xc000 | i);
		}
		snapshot.memory[page] = memory_page;
	}
	bus.var_write('port_7ffd_value', port_7ffd);
	return snapshot;
}

ZX_Snapshot.restore = function (snapshot, bus, cpu) {
	bus.reset();
	for ( var page = 0; page < 8 && !!snapshot.memory[page]; page++ ) {
		bus.var_write('port_7ffd_value', page);
		for ( var i = 0x0000; i < 0x4000; i++ ) {
			bus.mem_write(0xc000 | i, snapshot.memory[page][i]);
		}
	}
	bus.var_write('port_7ffd_value', snapshot.port_7ffd);
	bus.var_write('rom_trdos', snapshot.trdos);
	bus.io_write(0xfe, snapshot.border & 0x07);
	var cpuState = {
		af: snapshot.cpuState.af,
		bc: snapshot.cpuState.bc,
		de: snapshot.cpuState.de,
		hl: snapshot.cpuState.hl,
		af_: snapshot.cpuState.af_,
		bc_: snapshot.cpuState.bc_,
		de_: snapshot.cpuState.de_,
		hl_: snapshot.cpuState.hl_,
		i: snapshot.cpuState.i,
		r: snapshot.cpuState.r,
		ix: snapshot.cpuState.ix,
		iy: snapshot.cpuState.iy,
		pc: snapshot.cpuState.pc,
		sp: snapshot.cpuState.sp,
		iff: snapshot.cpuState.iff,
		imf: snapshot.cpuState.imf,
		prefix_dd: false,
		prefix_fd: false,
		prefix_ed: false,
		prefix_cb: false
	};
	cpu.set_state(cpuState);
}

ZX_Snapshot.createFromSNA48 = function ( sna_data ) {
	var snapshot = new ZX_Snapshot();

	snapshot.cpuState.i = sna_data[0];
	snapshot.cpuState.hl_ = ( sna_data[2] << 8 ) | sna_data[1];
	snapshot.cpuState.de_ = ( sna_data[4] << 8 ) | sna_data[3];
	snapshot.cpuState.bc_ = ( sna_data[6] << 8 ) | sna_data[5];
	snapshot.cpuState.af_ = ( sna_data[8] << 8 ) | sna_data[7];
	snapshot.cpuState.hl = ( sna_data[10] << 8 ) | sna_data[9];
	snapshot.cpuState.de = ( sna_data[12] << 8 ) | sna_data[11];
	snapshot.cpuState.bc = ( sna_data[14] << 8 ) | sna_data[13];
	snapshot.cpuState.iy = ( sna_data[16] << 8 ) | sna_data[15];
	snapshot.cpuState.ix = ( sna_data[18] << 8 ) | sna_data[17];
	snapshot.cpuState.iff = ( sna_data[19] & 0x04 ) ? 0x01 : 0x00;
	snapshot.cpuState.r = sna_data[20];
	snapshot.cpuState.af = ( sna_data[22] << 8 ) | sna_data[21];
	snapshot.cpuState.sp = ( sna_data[24] << 8 ) | sna_data[23];
	switch ( sna_data[25] ) {
		case 0: snapshot.cpuState.imf = 0x00; break;
		case 1: snapshot.cpuState.imf = 0x02; break;
		case 2: snapshot.cpuState.imf = 0x03; break;
	}

	snapshot.border = sna_data[26];

	var sna_index = 27;

	create_mem_page(5);
	create_mem_page(2);
	create_mem_page(0);

	// эмуляция команды RETN
	snapshot.cpuState.pc = get_mem_word(snapshot.cpuState.sp);
	snapshot.cpuState.sp = ( snapshot.cpuState.sp + 2 ) & 0xffff;
	snapshot.cpuState.iff = ( snapshot.cpuState.iff & 0x01 ) ? 0x03 : 0x00;

	function create_mem_page( num ) {
		snapshot.memory[num] = [];
		for ( var address = 0x0000; address < 0x4000; address++ ) {
			snapshot.memory[num][address] = sna_data[sna_index++];
		}
	}

	function get_mem_word( address ) {
		var lo_byte = get_mem_byte(address);
		var hi_byte = get_mem_byte(address + 1);
		return ( hi_byte << 8 ) | lo_byte;
	}

	function get_mem_byte( address ) {
		if ( address < 0x4000 ) {
			throw new Error('Incorrect RAM address');
		}
		else if ( address < 0x8000 ) {
			return snapshot.memory[5][address & 0x3fff];
		}
		else if ( address < 0xc000 ) {
			return snapshot.memory[2][address & 0x3fff];
		}
		else {
			return snapshot.memory[0][address & 0x3fff];
		}
	}

	return snapshot;
}


ZX_Snapshot.createFromSNA128 = function ( sna_data ) {
	var snapshot = new ZX_Snapshot();

	snapshot.cpuState.i = sna_data[0];
	snapshot.cpuState.hl_ = ( sna_data[2] << 8 ) | sna_data[1];
	snapshot.cpuState.de_ = ( sna_data[4] << 8 ) | sna_data[3];
	snapshot.cpuState.bc_ = ( sna_data[6] << 8 ) | sna_data[5];
	snapshot.cpuState.af_ = ( sna_data[8] << 8 ) | sna_data[7];
	snapshot.cpuState.hl = ( sna_data[10] << 8 ) | sna_data[9];
	snapshot.cpuState.de = ( sna_data[12] << 8 ) | sna_data[11];
	snapshot.cpuState.bc = ( sna_data[14] << 8 ) | sna_data[13];
	snapshot.cpuState.iy = ( sna_data[16] << 8 ) | sna_data[15];
	snapshot.cpuState.ix = ( sna_data[18] << 8 ) | sna_data[17];
	snapshot.cpuState.iff = ( sna_data[19] & 0x04 ) ? 0x03 : 0x00;
	snapshot.cpuState.r = sna_data[20];
	snapshot.cpuState.af = ( sna_data[22] << 8 ) | sna_data[21];
	snapshot.cpuState.sp = ( sna_data[24] << 8 ) | sna_data[23];
	switch ( sna_data[25] ) {
		case 0: snapshot.cpuState.imf = 0x00; break;
		case 1: snapshot.cpuState.imf = 0x02; break;
		case 2: snapshot.cpuState.imf = 0x03; break;
	}

	snapshot.border = sna_data[26];
	snapshot.cpuState.pc = ( sna_data[49180] << 8 ) | sna_data[49179];
	snapshot.port_7ffd = sna_data[49181];
	snapshot.trdos = sna_data[49182];

	var current_page = snapshot.port_7ffd & 0x07;
	var sna_index = 27;

	create_mem_page(5);
	create_mem_page(2);
	create_mem_page(current_page);

	sna_index = 49183;

	for ( var page = 0; page < 8; page++ ) {
		create_mem_page(page);
	}

	function create_mem_page( num ) {
		if ( !snapshot.memory[num] ) {
			snapshot.memory[num] = [];
			for ( var address = 0x0000; address < 0x4000; address++ ) {
				snapshot.memory[num][address] = sna_data[sna_index++];
			}
		}
	}

	return snapshot;
}

ZX_Snapshot.createFromSNA = function( sna_data ) {
	switch ( sna_data.length ) {
		case 49179: 
			return ZX_Snapshot.createFromSNA48( sna_data );

		case 131103:
		case 147487: 
			return ZX_Snapshot.createFromSNA128( sna_data );

		default:
			throw new Error('Неподдерживаемая длина файла');
	}
}

ZX_Snapshot.saveToSNA48 = function ( snapshot ) {
	var sna_data = [];
	
	var override_block = []

	var sp = ( snapshot.cpuState.sp - 2 ) & 0xffff;
	override_mem( sp, snapshot.cpuState.pc & 0xff );
	override_mem(( sp + 1 ) & 0xffff, snapshot.cpuState.pc >> 8 );

	sna_data.push( snapshot.cpuState.i );
	sna_data.push( snapshot.cpuState.hl_ & 0xff );
	sna_data.push( snapshot.cpuState.hl_ >> 8 );
	sna_data.push( snapshot.cpuState.de_ & 0xff );
	sna_data.push( snapshot.cpuState.de_ >> 8 );
	sna_data.push( snapshot.cpuState.bc_ & 0xff );
	sna_data.push( snapshot.cpuState.bc_ >> 8 );
	sna_data.push( snapshot.cpuState.af_ & 0xff );
	sna_data.push( snapshot.cpuState.af_ >> 8 );
	sna_data.push( snapshot.cpuState.hl & 0xff );
	sna_data.push( snapshot.cpuState.hl >> 8 );
	sna_data.push( snapshot.cpuState.de & 0xff );
	sna_data.push( snapshot.cpuState.de >> 8 );
	sna_data.push( snapshot.cpuState.bc & 0xff );
	sna_data.push( snapshot.cpuState.bc >> 8 );
	sna_data.push( snapshot.cpuState.iy & 0xff );
	sna_data.push( snapshot.cpuState.iy >> 8 );
	sna_data.push( snapshot.cpuState.ix & 0xff );
	sna_data.push( snapshot.cpuState.ix >> 8 );
	sna_data.push( snapshot.cpuState.iff & 0x01 ? 0x04 : 0x00)
	sna_data.push( snapshot.cpuState.r );
	sna_data.push( snapshot.cpuState.af & 0xff );
	sna_data.push( snapshot.cpuState.af >> 8 );
	sna_data.push( sp & 0xff );
	sna_data.push( sp >> 8 );
	switch ( snapshot.cpuState.imf ) {
		case 0x00:
		case 0x01: sna_data.push(0); break;
		case 0x02: sna_data.push(1); break;
		case 0x03: sna_data.push(2); break;
	}
	sna_data.push( snapshot.border );

	save_mem_page(5);
	save_mem_page(2);
	save_mem_page(snapshot.port_7ffd & 0x07);

	return sna_data;

	function override_mem ( address, value ) {
		if ( address < 0x4000 ) {
			return;
		}

		var page;

		if ( address < 0x8000 ) {
			page = 5;
		}
		else if ( address < 0xc000 ) {
			page = 2;
		}
		else {
			page = snapshot.port_7ffd & 0x07;
		}

		if ( !override_block[page] ) {
			override_block[page] = [];
		}

		override_block[page][address & 0x3fff] = value;
	}

	function save_mem_page( num ) {
		for ( var address = 0x0000; address < 0x4000; address++ ) {
			if ( override_block[num] && override_block[num][address] !== undefined ) {
				sna_data.push(override_block[num][address]);
			}
			else {
				sna_data.push(snapshot.memory[num][address]);
			}
		}
	}
}

ZX_Snapshot.saveToSNA128 = function ( snapshot ) {
	var sna_data = [];

	sna_data.push( snapshot.cpuState.i );
	sna_data.push( snapshot.cpuState.hl_ & 0xff );
	sna_data.push( snapshot.cpuState.hl_ >> 8 );
	sna_data.push( snapshot.cpuState.de_ & 0xff );
	sna_data.push( snapshot.cpuState.de_ >> 8 );
	sna_data.push( snapshot.cpuState.bc_ & 0xff );
	sna_data.push( snapshot.cpuState.bc_ >> 8 );
	sna_data.push( snapshot.cpuState.af_ & 0xff );
	sna_data.push( snapshot.cpuState.af_ >> 8 );
	sna_data.push( snapshot.cpuState.hl & 0xff );
	sna_data.push( snapshot.cpuState.hl >> 8 );
	sna_data.push( snapshot.cpuState.de & 0xff );
	sna_data.push( snapshot.cpuState.de >> 8 );
	sna_data.push( snapshot.cpuState.bc & 0xff );
	sna_data.push( snapshot.cpuState.bc >> 8 );
	sna_data.push( snapshot.cpuState.iy & 0xff );
	sna_data.push( snapshot.cpuState.iy >> 8 );
	sna_data.push( snapshot.cpuState.ix & 0xff );
	sna_data.push( snapshot.cpuState.ix >> 8 );
	sna_data.push( snapshot.cpuState.iff & 0x01 ? 0x04 : 0x00)
	sna_data.push( snapshot.cpuState.r );
	sna_data.push( snapshot.cpuState.af & 0xff );
	sna_data.push( snapshot.cpuState.af >> 8 );
	sna_data.push( snapshot.cpuState.sp & 0xff );
	sna_data.push( snapshot.cpuState.sp >> 8 );
	switch ( snapshot.cpuState.imf ) {
		case 0x00:
		case 0x01: sna_data.push(0); break;
		case 0x02: sna_data.push(1); break;
		case 0x03: sna_data.push(2); break;
	}
	sna_data.push( snapshot.border );

	var saved_pages = '';

	save_mem_page(5);
	save_mem_page(2);
	save_mem_page(snapshot.port_7ffd & 0x07);

	sna_data.push( snapshot.cpuState.pc & 0xff );
	sna_data.push( snapshot.cpuState.pc >> 8 );
	sna_data.push( snapshot.port_7ffd & 0x3f );
	sna_data.push( snapshot.trdos ? 1 : 0 );

	for ( var page = 0; page < 8; page++ ) {
		if ( saved_pages.indexOf( page.toFixed(0) ) == -1 ) {
			save_mem_page(page);
		}
	}

	return sna_data;

	function save_mem_page( num ) {
		for ( var address = 0x0000; address < 0x4000; address++ ) {
			sna_data.push(snapshot.memory[num][address]);
		}

		saved_pages += num.toFixed(0);
	}	
}

ZX_Snapshot.saveToSNA = function ( snapshot ) {
	if ( snapshot.port_7ffd & 0x20 ) {
		return ZX_Snapshot.saveToSNA48(snapshot);
	}
	else {
		return ZX_Snapshot.saveToSNA128(snapshot);
	}
}