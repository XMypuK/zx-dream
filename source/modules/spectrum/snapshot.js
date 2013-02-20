function ZX_Snapshot () {
	this.z80_state = {
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

ZX_Snapshot.createFromSNA48 = function ( sna_data ) {
	var snapshot = new ZX_Snapshot();

	snapshot.z80_state.i = sna_data[0];
	snapshot.z80_state.hl_ = ( sna_data[2] << 8 ) | sna_data[1];
	snapshot.z80_state.de_ = ( sna_data[4] << 8 ) | sna_data[3];
	snapshot.z80_state.bc_ = ( sna_data[6] << 8 ) | sna_data[5];
	snapshot.z80_state.af_ = ( sna_data[8] << 8 ) | sna_data[7];
	snapshot.z80_state.hl = ( sna_data[10] << 8 ) | sna_data[9];
	snapshot.z80_state.de = ( sna_data[12] << 8 ) | sna_data[11];
	snapshot.z80_state.bc = ( sna_data[14] << 8 ) | sna_data[13];
	snapshot.z80_state.iy = ( sna_data[16] << 8 ) | sna_data[15];
	snapshot.z80_state.ix = ( sna_data[18] << 8 ) | sna_data[17];
	snapshot.z80_state.iff = ( sna_data[19] & 0x04 ) ? 0x01 : 0x00;
	snapshot.z80_state.r = sna_data[20];
	snapshot.z80_state.af = ( sna_data[22] << 8 ) | sna_data[21];
	snapshot.z80_state.sp = ( sna_data[24] << 8 ) | sna_data[23];
	switch ( sna_data[25] ) {
		case 0: snapshot.z80_state.imf = 0x00; break;
		case 1: snapshot.z80_state.imf = 0x02; break;
		case 2: snapshot.z80_state.imf = 0x03; break;
	}

	snapshot.border = sna_data[26];

	var sna_index = 27;

	create_mem_page(5);
	create_mem_page(2);
	create_mem_page(0);

	// эмуляция команды RETN
	snapshot.z80_state.pc = get_mem_word(snapshot.z80_state.sp);
	snapshot.z80_state.sp = ( snapshot.z80_state.sp + 2 ) & 0xffff;
	snapshot.z80_state.iff = ( snapshot.z80_state.iff & 0x01 ) ? 0x03 : 0x00;

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

	snapshot.z80_state.i = sna_data[0];
	snapshot.z80_state.hl_ = ( sna_data[2] << 8 ) | sna_data[1];
	snapshot.z80_state.de_ = ( sna_data[4] << 8 ) | sna_data[3];
	snapshot.z80_state.bc_ = ( sna_data[6] << 8 ) | sna_data[5];
	snapshot.z80_state.af_ = ( sna_data[8] << 8 ) | sna_data[7];
	snapshot.z80_state.hl = ( sna_data[10] << 8 ) | sna_data[9];
	snapshot.z80_state.de = ( sna_data[12] << 8 ) | sna_data[11];
	snapshot.z80_state.bc = ( sna_data[14] << 8 ) | sna_data[13];
	snapshot.z80_state.iy = ( sna_data[16] << 8 ) | sna_data[15];
	snapshot.z80_state.ix = ( sna_data[18] << 8 ) | sna_data[17];
	snapshot.z80_state.iff = ( sna_data[19] & 0x04 ) ? 0x01 : 0x00;
	snapshot.z80_state.r = sna_data[20];
	snapshot.z80_state.af = ( sna_data[22] << 8 ) | sna_data[21];
	snapshot.z80_state.sp = ( sna_data[24] << 8 ) | sna_data[23];
	switch ( sna_data[25] ) {
		case 0: snapshot.z80_state.imf = 0x00; break;
		case 1: snapshot.z80_state.imf = 0x02; break;
		case 2: snapshot.z80_state.imf = 0x03; break;
	}

	snapshot.border = sna_data[26];
	snapshot.z80_state.pc = ( sna_data[49180] << 8 ) | sna_data[49179];
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
			return null;
	}
}

ZX_Snapshot.saveToSNA48 = function ( snapshot ) {
	var sna_data = [];
	
	var override_block = []

	var sp = ( snapshot.z80_state.sp - 2 ) & 0xffff;
	override_mem( sp, snapshot.z80_state.pc & 0xff );
	override_mem(( sp + 1 ) & 0xffff, snapshot.z80_state.pc >> 8 );

	sna_data.push( snapshot.z80_state.i );
	sna_data.push( snapshot.z80_state.hl_ & 0xff );
	sna_data.push( snapshot.z80_state.hl_ >> 8 );
	sna_data.push( snapshot.z80_state.de_ & 0xff );
	sna_data.push( snapshot.z80_state.de_ >> 8 );
	sna_data.push( snapshot.z80_state.bc_ & 0xff );
	sna_data.push( snapshot.z80_state.bc_ >> 8 );
	sna_data.push( snapshot.z80_state.af_ & 0xff );
	sna_data.push( snapshot.z80_state.af_ >> 8 );
	sna_data.push( snapshot.z80_state.hl & 0xff );
	sna_data.push( snapshot.z80_state.hl >> 8 );
	sna_data.push( snapshot.z80_state.de & 0xff );
	sna_data.push( snapshot.z80_state.de >> 8 );
	sna_data.push( snapshot.z80_state.bc & 0xff );
	sna_data.push( snapshot.z80_state.bc >> 8 );
	sna_data.push( snapshot.z80_state.iy & 0xff );
	sna_data.push( snapshot.z80_state.iy >> 8 );
	sna_data.push( snapshot.z80_state.ix & 0xff );
	sna_data.push( snapshot.z80_state.ix >> 8 );
	sna_data.push( snapshot.z80_state.iff & 0x01 ? 0x04 : 0x00)
	sna_data.push( snapshot.z80_state.r );
	sna_data.push( snapshot.z80_state.af & 0xff );
	sna_data.push( snapshot.z80_state.af >> 8 );
	sna_data.push( sp & 0xff );
	sna_data.push( sp >> 8 );
	switch ( snapshot.z80_state.imf ) {
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
		var mem_page = snapshot.memory[num];

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

	sna_data.push( snapshot.z80_state.i );
	sna_data.push( snapshot.z80_state.hl_ & 0xff );
	sna_data.push( snapshot.z80_state.hl_ >> 8 );
	sna_data.push( snapshot.z80_state.de_ & 0xff );
	sna_data.push( snapshot.z80_state.de_ >> 8 );
	sna_data.push( snapshot.z80_state.bc_ & 0xff );
	sna_data.push( snapshot.z80_state.bc_ >> 8 );
	sna_data.push( snapshot.z80_state.af_ & 0xff );
	sna_data.push( snapshot.z80_state.af_ >> 8 );
	sna_data.push( snapshot.z80_state.hl & 0xff );
	sna_data.push( snapshot.z80_state.hl >> 8 );
	sna_data.push( snapshot.z80_state.de & 0xff );
	sna_data.push( snapshot.z80_state.de >> 8 );
	sna_data.push( snapshot.z80_state.bc & 0xff );
	sna_data.push( snapshot.z80_state.bc >> 8 );
	sna_data.push( snapshot.z80_state.iy & 0xff );
	sna_data.push( snapshot.z80_state.iy >> 8 );
	sna_data.push( snapshot.z80_state.ix & 0xff );
	sna_data.push( snapshot.z80_state.ix >> 8 );
	sna_data.push( snapshot.z80_state.iff & 0x01 ? 0x04 : 0x00)
	sna_data.push( snapshot.z80_state.r );
	sna_data.push( snapshot.z80_state.af & 0xff );
	sna_data.push( snapshot.z80_state.af >> 8 );
	sna_data.push( snapshot.z80_state.sp & 0xff );
	sna_data.push( snapshot.z80_state.sp >> 8 );
	switch ( snapshot.z80_state.imf ) {
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

	sna_data.push( snapshot.z80_state.pc & 0xff );
	sna_data.push( snapshot.z80_state.pc >> 8 );
	sna_data.push( snapshot.port_7ffd & 0x3f );
	sna_data.push( snapshot.trdos ? 1 : 0 );

	for ( var page = 0; page < 8; page++ ) {
		if ( saved_pages.indexOf( page.toFixed(0) ) == -1 ) {
			save_mem_page(page);
		}
	}

	return sna_data;

	function save_mem_page( num ) {
		var mem_page = snapshot.memory[num];

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