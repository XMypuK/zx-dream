function ZX_WorkLoop( settings, z80, display ) {
	var ts_per_int_min;
	var ts_per_int_max;
	var int_period;
	var perfomance_time = 0;
	var perfomance_counter = 0;
	var fps_counter = 0;
	var loop_interval_id;
	var is_started = false;

	// интервал в тактах процессора, по прошествии которого проверяется необходимость прерывания
	// ( такой подход значительно увеличивает производительность, но, соответственно, чем выше
	//   число, тем ниже "временная" точность прерывания )
	var ts_packet_length = 1000;

	this.apply_settings = apply_settings;
	this.start = start;
	this.stop = stop;
	this.is_started = function () { return is_started; }

	// реализация нулевых таймаутов ( setTimout(fn , 0) не дает нулевую задержку )
	var zeroTimeoutQueue = [];
	var zeroTimeoutMessageName = "zto";

	initZeroTimeoutFunction();

	function initZeroTimeoutFunction() {
		window.addEventListener("message", handleZeroTimeoutMessage, true);
	}

	function handleZeroTimeoutMessage( e ) {
		if (( e.source == window ) && ( e.data == zeroTimeoutMessageName )) {
			e.stopPropagation();
			if ( zeroTimeoutQueue.length ) {
				var fn = zeroTimeoutQueue.shift();
				fn();
			}
		}
	}

	function setZeroTimeout( fn ) {
		zeroTimeoutQueue.push(fn);
		window.postMessage(zeroTimeoutMessageName, '*');
	}

	function clearAllZeroTimeouts() {
		zeroTimeoutQueue.splice(0, zeroTimeoutQueue.length);
	}

	// применение настроек
	apply_settings(settings);

	function apply_settings ( settings ) {
		if ( settings.turbo_mode ) {
			ts_per_int_min = settings.turbo_tstates_per_int_min;
			ts_per_int_max = settings.turbo_tstates_per_int_max;
		}
		else {
			ts_per_int_min = settings.tstates_per_int_min;
			ts_per_int_max = settings.tstates_per_int_max;
		}

		int_period = settings.int_period;
	}

	function start() {
		if ( !is_started ) {
			is_started = true;

			if ( int_period ) {
				loop_interval_id = setInterval(loop, int_period);
			}
			else {
				setZeroTimeout(loop);
			}
		}
	}

	function stop() {
		is_started = false;
		clearAllZeroTimeouts();
		clearInterval(loop_interval_id);
	}

	function loop() {
		z80.set_ts_cnt(0);
		
		var next_int_time = (new Date()).valueOf() + int_period;
		var ts_packet_bound = ts_packet_length;

		display.redraw();
		
		do {
			do {
				z80.process();
			}
			while ( z80.get_ts_cnt() < ts_packet_bound );

			ts_packet_bound += ts_packet_length;

			var break_chance = ( !ts_per_int_min || z80.get_ts_cnt() >= ts_per_int_min );
			var break_cond1 = ( break_chance && z80.get_ts_cnt() >= ts_per_int_max );
			var break_cond2 = ( break_chance && ( !int_period || (new Date()).valueOf() >= next_int_time ));
		}
		while ( !( break_cond1 || break_cond1 ));

		z80.intrq();

		perfomance_counter += z80.get_ts_cnt();
		fps_counter++;

		var cur_time = (new Date()).valueOf();
		if (( cur_time - perfomance_time ) >= 1000 ) {
			display.set_border_text('~ ' + ( perfomance_counter / 1000000 ).toFixed(2) + ' MHz  ' + fps_counter + ' FPS');

			perfomance_time = cur_time;
			perfomance_counter = 0;
			fps_counter = 0;
		}

		if ( !int_period ) {
			setZeroTimeout(loop);
		}
	}
}