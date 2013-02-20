function ZX_BetaDisk() {
	'use strict';
	
	/* 
		По расчетам из спецификации к ВГ-93 на дорожку 
		приблизительно помещается 10364 байт данных в 
		режиме MFM и 5156 байт в режиме FM.

		Однако в TR-DOS'е с режимом MFM типичной длиной
		дорожки считается 6250 байт (6208...6464 байт).
		Эта цифра и взята за основу, т.к. при первом 
		варианте случаются ошибки. Для режима FM взято
		соответственно число 3125.
	*/

	var drives = [
		{ image: null, track: 0 }, 
		{ image: null, track: 0 }, 
		{ image: null, track: 0 },
		{ image: null, track: 0 }
	];

	function insert( drive_code, image ) {
		drive_code = drive_code_to_index(drive_code);

		if (!isNaN(drive_code)) {
			// сначала извлекаем текущий диск, если он есть
			if ( drives[ drive_code ] ) {
				eject(drive_code);
			}

			// вставляем новый
			drives[ drive_code ].image = image;

			// генерируем событие, если необходимо
			on_drive_ready(drive_code);
		}
	}

	function eject( drive_code ) {
		drive_code = drive_code_to_index(drive_code);

		if (!isNaN(drive_code)) {
			drives[ drive_code ].image = null;
			on_drive_unready(drive_code);
		}
	}

	function ready( drive_code ) {
		if ( drive_code === undefined ) {
			drive_code = drive;
		}

		drive_code = drive_code_to_index(drive_code);

		if (!isNaN(drive_code)) {
			return !!drives[ drive_code ].image;
		}
		else {
			return false;
		}
	}

	function get_image( drive_code ) {
		drive_code = drive_code_to_index(drive_code);
		if (!isNaN(drive_code)) {
			return drives[ drive_code ].image;
		}
		else {
			return null;
		}
	}

	function drive_code_to_index( drive_code ) {
		if ( typeof drive_code == 'string' ) {
			switch ( drive_code.toUpperCase() ) {
				case 'A': return 0;
				case 'B': return 1;
				case 'C': return 2;
				case 'D': return 3;
				case '0': return 0;
				case '1': return 1;
				case '2': return 2;
				case '3': return 3;
			}
		}

		if ( typeof drive_code == 'number' && drive_code >= 0 && drive_code <= 3 ) {
			return drive_code;
		}

		return NaN;
	}

	// Ввод/вывод в контроллер возможен только
	// из кода TR-DOS, данная перемення кеширует
	// состояние активности ПЗУ TR-DOS'а.
	var rom_trdos = false;

	var drive = 0;
	var head = 0; // 0 - нижняя головка, 1 - верхняя
	var mfm = 0; // 0 - MFM, 1 - FM ( UNDONE: not sure )

	// интервал появления индексного отверстия (ms)
	var index_pointer_interval = 200;

	// длина индексного отверстия (ms)
	var index_pointer_length = 10;

	// таймаут чтения или записи дорожки, после которого происходит прерывание операции
	var track_rw_timeout = index_pointer_interval * 2;//000000;

	// Таймаут чтения или записи одного байта (ms).
	// В чистом виде не используется, т.к. слишком
	// мал, а используется на группе байтов.
	// Реальное время чтения/записи одного байта в
	// режиме MFM составляет 0.032 ms, но из-за
	// низкой производительности js используется
	// большее число.
	var rw_timeout = 0.15;

	var hld_extratime = index_pointer_interval * 15;

	function index_pointer() {
		return (( new Date().getTime() - last_index_pointer_time ) < index_pointer_length );
	}


	var intrq = 0;
	var drq = 0;

	var hlt = 0; // приходит с порта 0xff

	// После прекращения выполнения команды, использующей
	// загрузку головки, сигнал hld ещё держится 15 оборотов
	// диска (если только не осуществлен аппаратный сброс).
	// Эмуляция данного поведения.

	var busy = 0;
	var hld = 0;

	var idle_since = new Date().getTime();

	function is_busy() {
		return to_bool(busy);
	}

	function set_busy( value ) {
		busy = to_bit(value);

		if ( value ) {
			hld = get_hld();
		}
		else {
			idle_since = new Date().getTime();
		}
	}

	function get_hld() {
		if ( is_busy() ) {
			return hld;
		}
		else {
			if ( hld && ( new Date().getTime() - idle_since ) < hld_extratime ) {
				return 1;
			}
			else {
				return 0;
			}
		}
	}

	var seek_error = 0;
	var crc_error = 0;
	var rnf_error = 0;
	var lost_data_error = 0;
	var write_fault = 0;
	var record_type = 0; // 0 - normal, 1 - deleted

	var dirc = 1; // 1 - перемещение к центру, 0 - к краю
	var last_index_pointer_time = 0;

	var r_sector = 1; // для TR-DOS: от 1 по 16
	var r_track = 0;
	var r_command = 0x03;
	var r_data = 0;

	// last_command в отличие от r_command не меняется, если поступает команда прерывания во время выполнения другой команды
	var last_command = 0x00;

	// При перемещениях головки сбрасывается в 0.
	// При чтении адреса указывает на следующий сектор, с заголовкка
	// которого будет прочитан адрес. После чтения значение увеличивается
	// на 1 либо становится 0, если это был последний сектор на дорожке.
	var addr_sec_index = 0x00;

	var read_state = null;
	var write_state = null;

	var int_on_ready = false;
	var int_on_unready = false;
	var int_on_index_pointer = false;

	function on_drive_ready( drive_index ) {
		if ( drive_index == drive && int_on_ready ) {
			intrq = 1;
			int_on_ready = false;
		}
	}

	function on_drive_unready( drive_index ) {
		if ( drive_index == drive && int_on_unready ) {
			intrq = 1;
			int_on_unready = false;
		}
	}

	function on_index_pointer() {
		last_index_pointer_time = new Date().getTime();
		if ( int_on_index_pointer ) {
			intrq = 1;
		}
		setTimeout(on_index_pointer, index_pointer_interval);
	}
	setTimeout(on_index_pointer, index_pointer_interval);

	function to_bit(b) {
		return b ? 1 : 0;
	}

	function to_bool(b) {
		return !!b;
	}

	function get_current_image() {
		return drives[ drive ].image;
	}

	function get_current_track() {
		return drives[ drive ].track;
	}

	function set_current_track( value ) {
		drives[ drive ].track = value;
	}

	function vg93_write( address, data ) {
		// console.log('write', address, data);
		switch ( address ) {
			case 0x00: process_command(data); break;
			case 0x01: r_track = data; break;
			case 0x02: r_sector = data; break;
			case 0x03:
				r_data = data;
				if ( write_state ) {
					write_next_byte();
				}
				break;
		}
	}

	function vg93_read( address ) {
		var result;
		switch ( address ) {
			case 0x00: result = get_status(); break;
			case 0x01: result = r_track; break;
			case 0x02: result = r_sector; break;
			case 0x03:
				var result = r_data;
				if ( read_state ) {
					read_next_byte();
				}
				break;
		}

		// console.log('read', address, result);
		return result;
	}

	function process_command( cmd ) {
		r_command = cmd;

		// проверка не команду прерывания
		if (( r_command & 0xf0 ) == 0xd0 ) {
			// прерывание команды

			if ( is_busy() ) {
				set_busy(false);

				if ( read_state && read_state.timeout ) {
					clearTimeout(read_state.timeout);
				}
				read_state = null;

				if ( write_state && write_state.timeout ) {
					clearTimeout(write_state.timeout);
				}
				write_state = null;
			}
			else {
				set_busy(false);
				seek_error = 0;
				crc_error = 0;
				last_command = r_command;
			}

			int_on_ready = !!(r_command & 0x01);
			int_on_unready = !!(r_command & 0x02);
			int_on_index_pointer = !!(r_command & 0x04);

			if (r_command & 0x08) {
				intrq = 1
			}

			return;
		}

		// другие команды не принимаются, если контроллер занят
		if ( is_busy() ) {
			return;
		}

		last_command = r_command;

		int_on_ready = false;
		int_on_unready = false;
		int_on_index_pointer = false;

		if (!(r_command & 0x80)) {
			// обработка первой группы команд:
			// восстановление
			// поиск
			// шаг
			// шаг назад
			// шаг вперед

			var f_headload = to_bool(r_command & 0x08);
			var f_verify = to_bool(r_command & 0x04);
			// мы работаем на максимальной скорости
			// var rate = command & 0x03; 

			set_busy(true);
			drq = 0;
			intrq = 0;
			seek_error = 0;
			crc_error = 0;
			hld = to_bit(f_headload);

			var cmd_restore = !(r_command & 0x70);
			var cmd_seek = ( r_command & 0x70 ) == 0x10;
			if ( cmd_restore ) {
				dirc = 0;
				set_current_track(0);
				r_track = 0;
				r_data = 0;
				addr_sec_index = 0;
				if ( f_verify ) {
					// проверяем соответствие идентификаторов на диске и в регистре дорожки
					if (ready()) {
						hld = 1;

						var image = get_current_image();
						var track_data = image.get_track(get_current_track(), head);
						var sec_data = track_data ? track_data.get_sector(0) : null;
						if ( sec_data ) {
							seek_error = sec_data.get_cyl_byte() != r_track;
						}
						else {
							seek_error = 1;
						}
					}
					else {
						seek_error = 1;
					}
				}
			}
			else if ( cmd_seek ) {
				// в регистре данных искомый номер дорожки
				if ( r_track != r_data ) {
					dirc = to_bit( r_track < r_data );
				}
				var diff = r_data - r_track;

				var phys_track = get_current_track();
				phys_track += diff;
				if ( phys_track < 0 ) { phys_track = 0; }
				if ( phys_track > 255 ) { phys_track = 255; }
				set_current_track(phys_track);

				r_track += diff;
				if ( r_track < 0 ) { r_track = 0; }
				if ( r_track > 255 ) { r_track = 255; }

				if ( phys_track == 0 ) {
					r_track = 0;
				}

				addr_sec_index = 0;

				if ( f_verify ) {
					// проверяем соответствие идентификаторов на диске и в регистре дорожки
					if ( ready() ) {
						hld = 1;

						var image = get_current_image();
						var track_data = image.get_track(get_current_track(), head);
						if ( sec_data ) {
							seek_error = sec_data.get_cyl_byte() != r_track;
						}
						else {
							seek_error = 1;
						}						
					}
					else {
						seek_error = 1;
					}
				}
			}
			else {
				switch ( r_command & 0x60 ) {
					case 0x40: dirc = 1; break;
					case 0x60: dirc = 0; break;
				}

				var phys_track = get_current_track();
				phys_track = ( dirc ? ( phys_track + 1 ) : ( phys_track - 1 ));
				if ( phys_track < 0 ) { phys_track = 0; }
				if ( phys_track > 255 ) { phys_track = 255; }

				var f_update = to_bool(r_command & 0x10);
				if ( f_update ) {
					r_track = ( dirc ? r_track + 1 : r_track - 1 );
					if ( r_track < 0 ) { r_track = 0; }
					if ( r_track > 255 ) { r_track = 255; }
				}

				if ( phys_track == 0 ) {
					r_track = 0;
				}

				addr_sec_index = 0;

				if ( f_verify ) {
					// проверяем, существует ли данная дорожка
					if (ready()) {
						hld = 1;

						var image = get_current_image();
						var track_data = image.get_track(get_current_track(), head);
						if ( sec_data ) {
							seek_error = sec_data.get_cyl_byte() != r_track;
						}
						else {
							seek_error = 1;
						}						
					}
					else {
						seek_error = 1;
					}
				}
			}
			
 			intrq = 1;
 			set_busy(false);
			return;
		}

		switch ( r_command & 0xe0 ) {
			case 0x80: read_sectors_begin(); return;
			case 0xa0: write_sectors_begin(); return;
		}

		switch ( r_command & 0xf0 ) {
			case 0xc0: read_address(); return;
			case 0xe0: read_track(); return;
			case 0xf0: write_track(); return;
		}
	}

	function read_sectors_begin() {
		var multiple = to_bool(r_command & 0x10);
		var expected_side = to_bit(r_command & 0x08);
		var wait_15ms = to_bool(r_command & 0x04);
		var check_side = to_bool(r_command & 0x02);
		var data_mark = to_bool(r_command & 0x01);

		set_busy(true);
		drq = 0;
		intrq = 0;
		crc_error = 0;
		rnf_error = 0;
		lost_data_error = 0;

		if (!ready()) {
			intrq = 1;
			set_busy(false);
			return;
		}

		hld = 1;
		read_sectors_end(multiple, expected_side, check_side);
	}

	function read_sectors_end( multiple, expected_side, check_side ) {
		var sec_data = get_sector_data(expected_side, check_side);
		if ( sec_data ) {
			var record_type = sec_data.is_deleted();
			var data = extract_sector_data(sec_data);

			schedule_data_reading(
				data,
				function() {
					clearTimeout(read_state.timeout);

					if ( multiple ) {
						r_sector++;
						read_sectors_end(multiple, expected_side, check_side);
					}
					else {
						read_state = null;
						drq = 0;
						intrq = 1;
						set_busy(false);
					}
				}
			);

			var t = data.length * rw_timeout;
			if ( t < 1 ) { r = 1 };

			read_state.timeout = setTimeout(function() {
				read_state = null;
				intrq = 1;
				drq = 0;
				lost_data_error = 1;
				set_busy(false);
			}, t);

			read_next_byte();
		}
		else {
			read_state = null;
			rnf_error = 1;
			intrq = 1;
			drq = 0;
			set_busy(false);
		}
	}

	function write_sectors_begin() {
		var multiple = to_bool(r_command & 0x10);
		var expected_side = to_bit(r_command & 0x08);
		var wait_15ms = to_bool(r_command & 0x04);
		var check_side = to_bool(r_command & 0x02);
		var deleted_address_mark = to_bool(r_command & 0x01);

		set_busy(true);
		drq = 0;
		intrq = 0;
		crc_error = 0;
		rnf_error = 0;
		lost_data_error = 0;
		write_fault = 0;

		if (!ready()) {
			intrq = 1;
			set_busy(false);
			return;
		}

		hld = 1;

		if ( get_current_image().is_write_protected() ) {
			intrq = 1;
			set_busy(false);
			return;
		}

		write_sectors_end(multiple, expected_side, check_side, deleted_address_mark);
	}

	function write_sectors_end( multiple, expected_side, check_side, deleted_address_mark ) {
		var sec_data = get_sector_data(expected_side, check_side);
		if ( sec_data ) {
			sec_data.is_deleted(deleted_address_mark);
			var length = ( 0x0080 << sec_data.get_length_byte() );

			schedule_data_writing(
				length,
				function(data) {
					clearTimeout(write_state.timeout);
					store_sector_data(sec_data, data);

					if ( multiple ) {
						r_sector++;
						write_sectors_end(multiple, expected_side, check_side, deleted_address_mark);
					}
					else {
						write_state = null;
						drq = 0;
						intrq = 1;
						set_busy(false);
					}
				}
			);

			var t = length * rw_timeout;
			if ( t < 1 ) { r = 1 }

			write_state.timeout = setTimeout(function(){
				write_state = null;
				intrq = 1;
				drq = 0;
				lost_data_error = 1;
				set_busy(false);
			}, t);

			drq = 1;		
		}
		else {
			write_state = null;
			rnf_error = 1;
			intrq = 1;
			drq = 0;
			set_busy(false);
		}		
	}

	function read_address() {
		var wait_15ms = to_bool(r_command & 0x04);

		set_busy(true);
		drq = 0;
		intrq = 0;
		crc_error = 0;
		rnf_error = 0;
		lost_data_error = 0;

		if (!ready()) {
			intrq = 1;
			set_busy(false);
			return;
		}

		hld = 1;

		var image = get_current_image();
		var track_data = image.get_track(get_current_track(), head);
		var sec_data = track_data ? track_data.get_sector(addr_sec_index) : null;
		if ( !sec_data ) {
			addr_sec_index = 0; // это так, на всякий случай :)

			rnf_error = 1;
			intrq = 1;
			drq = 0;
			read_state = null;
			set_busy(false);
			return;
		}

		addr_sec_index++;
		if ( addr_sec_index == track_data.get_sec_count() ) {
			addr_sec_index = 0;
		}

		schedule_data_reading(
			extract_sector_address(sec_data),
			function() {
				clearTimeout(read_state.timeout);
				read_state = null;
				rnf_error = 1;
				intrq = 1;
				drq = 0;
				set_busy(false);
			}
		);

		var t = 6 * rw_timeout;
		if ( t < 1 ) { t = 1; }

		read_state.timeout = setTimeout(function() {
			read_state = null;
			lost_data_error = 1;
			intrq = 1;
			drq = 0;
			set_busy(false);
		}, t);

		read_next_byte();		
	}

	function read_track() {
		set_busy(true);
		drq = 0;
		intrq = 0;
		crc_error = 0;
		seek_error = 0;
		lost_data_error = 0;

		if (!ready()) {
			intrq = 1;
			set_busy(false);
			return;
		}

		hld = 1;

		var image = get_current_image();
		var track_data = image.get_track(get_current_track(), head);
		var sec_count = track_data.get_sec_count();
		var data = [];

		// GAP IVa
		var gap_IVa = build_GAP(4);
		while ( gap_IVa.length ) { data.push(gap_IVa.pop()); }

		// SYNC
		var sync = build_SYNC();
		while ( sync.length ) { data.push(sync.pop()); }

		// Index Mark
		data.push(0xfc);

		// GAP I
		var gap_I = build_GAP(1);
		while ( gap_I.length ) { data.push(gap_I.pop()); }	

		// запись каждого сектора
		for ( var sec_index = 0; sec_index < sec_count; sec_index++ ) {

			var sec_data = track_data.get_sector(sec_index);

			// SYNC
			var sync = build_SYNC();
			while ( sync.length ) { data.push(sync.pop()); }

			// if MFM then 0xa1 * 3 (exact)
			if ( mfm ) { for ( var i = 0; i < 3; i++ ) { data.push(0xa1); } }

			// IDAM
			data.push(0xfe);

			// ID
			data.push(sec_data.get_cyl_byte());
			data.push(sec_data.get_head_byte());
			data.push(sec_data.get_sec_byte());
			data.push(sec_data.get_length_byte());

			// CRC
			var crc = new CRC();
			crc.add(sec_data.get_cyl_byte());
			crc.add(sec_data.get_head_byte());
			crc.add(sec_data.get_sec_byte());
			crc.add(sec_data.get_length_byte());
			data.push(( crc.value >> 8 ) & 0xff );
			data.push( crc.value & 0xff );

			// GAP II
			var gap_II = build_GAP(2);
			while ( gap_II.length ) { data.push(gap_II.pop()); }

			// SYNC
			var sync = build_SYNC();
			while ( sync.length ) { data.push(sync.pop()); }

			// if MFM then 0xa1 * 3 (exact)
			if ( mfm ) { for ( var i = 0; i < 3; i++ ) { data.push(0xa1); } }

			// DAM
			data.push(0xfb);

			// Data
			var crc = new CRC();
			var sec_data_length = ( 0x0080 << sec_data.get_length_byte() );
			for ( var i = 0; i < sec_data_length; i++ ) {
				data.push(sec_data.get_sec_byte(i));
				crc.add(sec_data.get_sec_byte(i));
			}

			// CRC
			data.push(( crc.value >> 8 ) & 0xff );
			data.push( crc.value & 0xff );

			// GAP III
			var gap_III = build_GAP(3);
			while ( gap_III.length ) { data.push(gap_III.pop()); }
		}


		// GAP IV b
		var gap_IVb = build_GAP(4);
		while ( gap_IVb.length ) { data.push(gap_IVb.pop()); }	
		
		// дополняем до приблизительной типичной длины дорожки
		var required_length = ( mfm ? 6250 : 3125 );
		while ( data.length < required_length ) {
			data.push( mfm ? 0x4e : 0xff );
		}

		schedule_data_reading(
			data,
			function() {
				clearTimeout(read_state.timeout);
				intrq = 1;
				drq = 0;
				read_state = null;
				set_busy(false);
			}
		);

		read_state.timeout = setTimeout(function() {
			read_state = null;
			drq = 0;
			intrq = 1;
			lost_data_error = 1;
			set_busy(false);
		}, track_rw_timeout); 

		read_next_byte();
	}

	function write_track() {
		set_busy(true);
		drq = 0;
		intrq = 0;
		crc_error = 0;
		seek_error = 0;
		lost_data_error = 0;
		write_fault = 0;

		if (!ready()) {
			intrq = 1;
			set_busy(false);
			return;
		}

		hld = 1;

		var image = get_current_image();

		if ( image.is_write_protected() ) {
			intrq = 1;
			set_busy(false);
			return;
		}

		var track_data = image.get_track(get_current_track(), head);

		var byte_counter = 0;
		var max_bytes = ( mfm ? 6250 : 3125 );

		var crc = new CRC();
		var crc_just_preseted = false;
		var crc_just_stored = false;

		var sector_address_zone = false;
		var sector_data_zone = false;
		var index = -1;

		var deleted = false;
		var cyl_byte = 0;
		var head_byte = 0;
		var sec_byte = 0;
		var length_byte = 0;

		var sec_data = null;
		var sec_length = 0;

		write_state = {
			action: function() {
				if ( byte_counter == 0 ) {
					if ( !track_data ) {
						clearTimeout(write_state.timeout);
						write_state = null;
						write_fault = 1;
						drq = 0;
						intrq = 1;
						set_busy(false);
						return;
					}

					track_data.clear();
				}

				var bytes = [];
				if ( mfm ) {
					if ( !crc_just_stored ) {
						// нормальная дешифровка
						switch ( r_data ) {
							case 0xf5:
								bytes.push(0xa1);
								crc = new CRC();
								//crc_just_preseted = true;
								crc_just_stored = false;
								break;

							case 0xf6:
								bytes.push(0xc2); 
								//crc_just_preseted = false;
								crc_just_stored = false;
								break;

							case 0xf7:
								bytes.push(( crc.value >> 8 ) & 0xff );
								bytes.push(( crc.value >> 0 ) & 0xff );
								//crc_just_preseted = false;
								crc_just_stored = true;
								break;

							default: 
								bytes.push(r_data);
								//crc_just_preseted = false;
								crc_just_stored = false;
								break;
						}
					}
					else {
						// баг дешифровки после записи котрольной суммы
						bytes.push(r_data);
						//crc_just_preseted = false;
						crc_just_stored = false;
					}
				}
				else {
					if ( !crc_just_stored ) {
						switch ( r_data ) {
							case 0xf7:
								bytes.push(( crc.value >> 8 ) & 0xff );
								bytes.push(( crc.value >> 0 ) & 0xff );
								//crc_just_preseted = false;
								crc_just_stored = true;
								break;

							case 0xf8:
							case 0xf9:
							case 0xfa:
							case 0xfb:
							case 0xfe:
								bytes.push(r_data);
								crc = new CRC();
								//crc_just_preseted = false;
								crc_just_stored = false;
								break;

							default:
								bytes.push(r_data);
								//crc_just_preseted = false;
								crc_just_stored = false;
								break;
						}
					}
					else {
						// баг дешифровки после записи котрольной суммы
						bytes.push(r_data);
						crc_just_preseted = false;
						crc_just_stored = false;						
					}
				}

				if ( !crc_just_stored ) {
					switch ( r_data ) {
						case 0xfe:
							if ( !sector_address_zone && !sector_data_zone ) {
								sector_address_zone = true;
								sector_data_zone = false;
								index = -1;
							}
							break;

						case 0xf8:
							if ( sector_address_zone ) {
								sector_address_zone = false;
								sector_data_zone = true;
								index = -1;
								deleted = true;
								sec_data = new SectorData(cyl_byte, head_byte, sec_byte, length_byte, deleted);
								sec_length = ( 0x0080 << length_byte );
								track_data.add_sector(sec_data);								
							}
							break;

						case 0xfb:
							if ( sector_address_zone ) {
								sector_address_zone = false;
								sector_data_zone = true;
								index = -1;
								deleted = false;
								sec_data = new SectorData(cyl_byte, head_byte, sec_byte, length_byte, deleted);
								sec_length = ( 0x0080 << length_byte );
								track_data.add_sector(sec_data);								
							}

							break;
					}
				}

				for ( var i = 0; i < bytes.length; i++ ) {
					if ( sector_address_zone ) {
						switch ( index ) {
							case 0: cyl_byte = bytes[i]; break;
							case 1: head_byte = bytes[i]; break;
							case 2: sec_byte = bytes[i]; break;
							case 3: length_byte = bytes[i];	break;
						}
					}

					if ( sector_data_zone && index >= 0 ) {
						if ( index < sec_length ) {
							sec_data.set_data_byte(index, bytes[i]);
						}
						else {
							sector_address_zone = false;
							sector_data_zone = false;
						}
					}

					// if ( crc_just_preseted ) {
					// 	crc_just_preseted = false;
					// }
					// else {
						crc.add(bytes[i]);
					// }

					index++;
					byte_counter++;

					if ( byte_counter < max_bytes ) {
						drq = 1;
					}
					else {
						clearTimeout(write_state.timeout);
						write_state = null;
						intrq = 1;
						drq = 0;
						set_busy(false);
						return;
					}
				}
			},
			timeout: setTimeout(function() {
				write_state = null;
				drq = 0;
				intrq = 1;
				lost_data_error = 1;
				set_busy(false);
			}, track_rw_timeout)
		}

		drq = 1;
	}

	// Производит поиск сектора по адресу:
	// - текущая дорожка
	// - текущая головка
	// - регистр r_sector
	// Возвращает найденный сектор либо null, если диск не
	// вставлен либо на текущей дорожке нет сектора с данным 
	// адресом.
	function get_sector_data( expected_side, check_side ) {
		if (!ready()) {
			return null;
		}

		var image = get_current_image();
		var track_data = image.get_track(get_current_track(), head);
		var sec_data = null;
		if ( track_data ) {
			var sec_count = track_data.get_sec_count();
			for ( var sec_index = 0; sec_index < sec_count; sec_index++ ) {
				var _sd = track_data.get_sector(sec_index);

				var track_match = ( _sd.get_cyl_byte() == r_track );
				var head_match = ( !check_side || ( _sd.get_head_byte() == expected_side ));
				var sec_match = ( _sd.get_sec_byte() == r_sector );

				if ( track_match && head_match && sec_match ) {
					sec_data = _sd;
					break;
				}
			}
		}

		return sec_data;
	}

	function extract_sector_address( sec_data ) {
		var crc = new CRC();
		if ( mfm ) { crc.add(0xa1); }
		crc.add(sec_data.is_deleted() ? 0xf8 : 0xfb);
		crc.add(sec_data.get_cyl_byte());
		crc.add(sec_data.get_head_byte());
		crc.add(sec_data.get_sec_byte());
		crc.add(sec_data.get_length_byte());

		var data = [];
		data.push(sec_data.get_cyl_byte());
		data.push(sec_data.get_head_byte());
		data.push(sec_data.get_sec_byte());
		data.push(sec_data.get_length_byte());
		data.push(( crc.value >> 8 ) & 0xff );
		data.push(( crc.value >> 0 ) & 0xff );

		return data;		
	}

	function extract_sector_data( sec_data ) {
		var data = [];
		var length = ( 0x0080 << sec_data.get_length_byte() );
		for ( var i = 0; i < length; i++ ) {
			data.push(sec_data.get_data_byte(i));
		}
		return data;
	}

	function store_sector_data( sec_data, data ) {
		var length = ( 0x0080 << sec_data.get_length_byte() );
		for ( var i = 0; i < length; i++ ) {
			sec_data.set_data_byte(i, data[i]);
		}
	}

	// Field		FM					MFM
	// =====================================================
	// GAP I		0xff * 16 (min)		0x4e * 32 (min)
	// GAP II		0xff * 11 (exact)	0x4e * 22 (exact)
	// GAP III		0xff * 10 (min)		0x4e * 24 (min)
	// GAP IV		0xff * 16 (min)		0x4e * 32 (min)
	// SYNC			0x00 * 6  (exact)	0x00 * 12 (exact)

	function build_GAP( gap_num ) {
		var count;
		var v8;
		if ( mfm ) {
			v8 = 0x4e;
			switch ( gap_num ) {
				case 1: count = 32; break;
				case 2: count = 22; break;
				case 3: count = 24; break;
				case 4: count = 32; break;
			}
		}
		else {
			v8 = 0xff;
			switch ( gap_num ) {
				case 1: count = 16; break;
				case 2: count = 11; break;
				case 3: count = 12; break;
				case 4: count = 16; break;
			}
		}

		var res = [];
		for ( var i = 0; i < count; i++ ) {
			res.push(v8);
		}
		return res;
	}

	function build_SYNC() {
		var count = mfm ? 12 : 6;
		var res = [];
		for ( var i = 0; i < count; i++ ) {
			res.push(0);
		}
		return res;
	}

	function build_GAP_III() {
		var res = [];
		if ( mfm ) {
			for ( var i = 0; i < 32; i++ ) {
				res.push(0x4e);
			}
		}
		else {
			for ( var i = 0; i < 16; i++ ) {
				res.push(0xff);
			}
		}
		return res;
	}

	function schedule_data_reading( data, oncomplete ) {
		read_state = {
			data: data,
			index: 0,
			oncomplete: oncomplete
		};
	}

	function read_next_byte() {
		if ( read_state.index < read_state.data.length ) {
			r_data = read_state.data[ read_state.index ];
			read_state.index++;
			drq = 1;
		}
		else {
			if ( typeof read_state.oncomplete == 'function' ) {
				read_state.oncomplete();
			}
		}
	}

	function schedule_data_writing( length, oncomplete ) {
		write_state = {
			data: [],
			index: 0,
			length: length,
			oncomplete: oncomplete
		}
	}

	function write_next_byte() {
		if ( write_state.action ) {
			write_state.action();
		}
		else {
			write_state.data[ write_state.index ] = r_data;
			write_state.index++;
			
			if ( write_state.index < write_state.length ) {
				drq = 1;
			}
			else {
				if ( typeof write_state.oncomplete == 'function' ) {
					write_state.oncomplete(write_state.data);
				}
			}				
		}
	}

	function get_status() {
		var rdy = ready();
		var is_write_protected = rdy && get_current_image().is_write_protected();

		var status = 0;

		// after Restore, Seek, Step commands and also Interrupt command if it actually did not unterrupt anything.
		if (( last_command & 0x80 ) == 0 || ( last_command & 0xf0 ) == 0xd0 ) {

			status = 
				( to_bit(!rdy) << 7 ) |
				( to_bit(is_write_protected) << 6 ) |
				( (get_hld() & hlt) << 5 ) | 
				( seek_error << 4 ) | 
				( crc_error << 3 ) | 
				( to_bit(get_current_track() == 0) << 2 ) | 
				( to_bit(rdy ? index_pointer() : 0) << 1 ) |
				( busy << 0 );
		}

		// after Read Address command
		if (( last_command & 0xf0 ) == 0xc0 ) {

			status =
				( to_bit(!rdy) << 7 ) |
				( rnf_error << 4 ) |
				( crc_error << 3 ) |
				( lost_data_error << 2 ) |
				( drq << 1 ) |
				( busy << 0 );
		}

		// after Read Sector command
		if (( last_command & 0xe0 ) == 0x80 ) {

			status = 
				( to_bit(!rdy) << 7 ) |
				( record_type << 6 ) |
				( rnf_error << 4 ) |
				( crc_error << 3 ) |
				( lost_data_error << 2 ) |
				( drq << 1 ) |
				( busy << 0 );
		}

		// after Read Track command
		if (( last_command & 0xf0 ) == 0xe0 ) {

			status = 
				( to_bit(!rdy) << 7 ) |
				( lost_data_error << 2 ) |
				( drq << 1 ) |
				( busy << 0 );
		}

		// after Write Sector command
		if (( last_command & 0xe0 ) == 0xa0 ) {

			status = 
				( to_bit(!rdy) << 7 ) |
				( to_bit(is_write_protected) << 6 ) |
				( write_fault << 5 ) |
				( rnf_error << 4 ) |
				( crc_error << 3 ) |
				( lost_data_error << 2 ) |
				( drq << 1 ) |
				( busy << 0 );
		}

		// after Write Track command
		if (( last_command & 0xf0 ) == 0xf0 ) {

			status =
				( to_bit(!rdy) << 7 ) |
				( to_bit(is_write_protected) << 6 ) |
				( write_fault << 5 ) |
				( lost_data_error << 2 ) |
				( drq << 1 ) |
				( busy << 0 );
		}

		intrq = 0;

		return status;
	}

	function write_sysreg( data ) {
		// console.log('write', 0xff, data);
		drive = data & 0x03;
		hlt = to_bit( data & 0x08 );
		head = to_bit( !( data & 0x10 ));
		mfm = to_bit( !( data & 0x40 ));

		if ( !(data & 0x04) ) {
			hardware_reset_controller();
		}
	}

	function read_sysreg( data ) {
		if ( intrq ) {
			data |= 0x80;
		}
		else {
			data &= 0x7f;
		}

		if ( drq ) {
			data |= 0x40;
		}
		else {
			data &= 0xbf;
		}

		// console.log('read', 0xff, data)
		return data;
	}

	function hardware_reset_controller() {
		int_on_ready = false;
		int_on_unready = false;
		int_on_index_pointer = false;

		intrq = 0;
		drq = 0;
		busy = 0;
		hld = 0;
		seek_error = 0;
		crc_error = 0;
		dirc = 0; // 1 - перемещение к центру, 0 - к краю

		r_sector = 1; // для TR-DOS: от 1 по 16
		r_track = 0;
		r_command = 0x03;
		r_data = 0;

		read_state = null;
		write_state = null;		

		process_command(0x03);
	}

	var dev = new ZX_Device({
		id: 'betadisk',
		iorq: function ( state, bus ) {
			if ( rom_trdos ) {
				if ( state.write && ( state.address & 0x9f ) == 0x1f ) {
					vg93_write(( state.address >> 5 ) & 0x03, state.data);
					return;
				}

				if ( state.read && ( state.address & 0x9f ) == 0x1f ) {
					state.data = vg93_read(( state.address >> 5 ) & 0x03 );
					return;
				}

				if ( state.write && ( state.address & 0xff ) == 0xff ) {
					write_sysreg(state.data);
					return;
				}

				if ( state.read && ( state.address & 0xff ) == 0xff ) {
					state.data = read_sysreg(state.data);
					return;
				}			
			}
		},
		event: function ( name, options, bus ) {
			if ( name == 'var_changed' && options.name == 'rom_trdos' ) {
				rom_trdos = options.value;
			}
		}
	});

	dev.insert = insert;
	dev.eject = eject;
	dev.ready = ready;
	dev.get_image = get_image;

	return dev;

	function CRC() {
		// CRC16 CCITT
		// Poly: 0x1021		x^16 + x^12 + x^5 + 1

		var self = this;

		self.value = 0xffff;
		self.add = function( v8 ) {
			self.value ^= ( v8 << 8 );
			for ( var i = 0; i < 8; i++ ) {
				self.value = ( self.value & 0x8000 ) ? (( self.value << 1 ) ^ 0x1021 ) : ( self.value << 1 );
			}
		}
	}
}