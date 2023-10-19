function ZX_Clock() {

	var _bus;
	var _cpu;

	// период запросов маскируемого прерывания в миллисекундах
	var intrqPeriod = 20;
	// количество выполняемых процессором тактов между маскируемыми прерываниями
	var tstatesPerIntrq = 70000;
	// количество выполняемых процессором тактов за одну миллисекунду
	var tstates_per_ms = 3500;
	// флаг работы рабочего цикла
	var running = false;
	// идентификатор интервала рабочего цикла
	var interval_id;
	// время запуска последней итерации рабочего цикла
	var interval_timestamp;
	// обратный счетчик тактов до маскируемого прерывания
	var intrq_tstates_backcounter;
	// время последнего вывода информации о производительности
	var performance_timestamp;
	// счетчик тактов с последнего вывода информации о производительности
	var performance_tstates;
	// счетчик фреймов (прерываний) с последнего вывода инфорамции о производительности
	var performance_fps;

	function run() {
		if ( running || !_bus || !_cpu )
			return;
		running = true;
		var now = Date.now();
		interval_id = setInterval(process, 4);
		interval_timestamp = now;
		intrq_tstates_backcounter = tstatesPerIntrq;
		performance_timestamp = now;
		performance_tstates = 0;
		performance_fps = 0;
	}

	function stop() {
		if ( !running )
			return;
		running = false;
		clearInterval(interval_id);
	}

	// Принцип выполнения итерации следующий:
	// 1. Вычисляется время, прошедшее с последней фиксации информации о производительности.
	// 2. Если время из п.1 достигло секунды, то рассчитывается примерная частота работы 
	//    процессора и количество фреймой (прерываний), выполненных за это время. После этого
	//	  время и счетчики производительности начинают считаться заново.
	// 3. Вычисляется количество миллисекунд, прошедших со времени запуска предыдущей итерации.
	// 4. Вычисляется количество тактов процессора, которое должно было отработать за время из п.1.
	//    При этом, если количество тактов процессора получилось слишком большое (превышает 
	//    количетсво тактов между прерываниями), то в качестве значения берется количество тактов,
	//    обрабатываемых за 4 мс. Это нужно для случаев, когда пользователь переключется со вкладки
	//    эмулятора на дргие вкладки или в другие приложения. В этом случае рабочий цикл
	//    приостанавливается и интервал между итерациями может оказаться таким большим, что попытка
	//    обработать столько тактов за одну итерацию приведет к зависанию вкладки. Кроме того, в
	//    этом случае может быть пропущено несколько прерываний, из-за того, что в одной итерации
	//    предусмотрен только один вызов прерывания.
	// 5. Если количество тактов из п.4 больше или равно количеству тактов до очередного 
	//    маскируемого прерывания, то выполняются процессорные инструкции вплоть до момента, когда
	//    необходимо вызвать прерывание. После чего на шину подается запрос прерывания.
	// 6. Если количество тактов из п.4 меньше количества тактов до маскируемого прерывания или
	//    если после отправки запроса прерывания ещё остались такты в рамках данной итерации, то
	//	  выолняются процессорные инструкции, пока этот остаток не закончится.
	// 7. В процессе выполнения итерации в нужных случаях корректируются счетчики производительности,
	//	  количество тактов до маскируемого прерывания и т.п.
	function process() {
		// фиксация время запуска итерации
		var now = Date.now();
		// проверка на необходимость вывода информации о производительности.
		var performance_elapsed = now - performance_timestamp
		if ( performance_elapsed >= 1000 ) {
			_bus.var_write('performance', {
				frequency: performance_tstates / (performance_elapsed * 1000),
				fps: performance_fps * 1000 / performance_elapsed
			});
			performance_timestamp = now;
			performance_tstates = 0;
			performance_fps = 0;
		}
		// расчет времени с запуска предыдущей итреации
		var elapsed = now - interval_timestamp;
		interval_timestamp = now;
		// расчет количества тактов для выполнения
		var planned_tstates = tstates_per_ms * elapsed;
		if (planned_tstates > tstatesPerIntrq) {
			planned_tstates = tstates_per_ms * 4;
		}
		// сброс счетчика тактов процессора
		_cpu.set_tstates(0);
		// проверка на необходимость выполнения прерывания во время итерации
		if (intrq_tstates_backcounter <= planned_tstates) {
			// работа процессора
			while (_cpu.get_tstates() < intrq_tstates_backcounter) {
				_cpu.process();
			}
			// прерывание
			_bus.var_write('intrq');
			// корректировка счетчиков
			var processed_tstates = _cpu.get_tstates();
			intrq_tstates_backcounter += tstatesPerIntrq - processed_tstates;
			planned_tstates -= processed_tstates;
			_cpu.set_tstates(0);
			performance_fps++;
			performance_tstates += processed_tstates;
		}
		// работа процессора
		while (_cpu.get_tstates() < planned_tstates) {
			_cpu.process();
		}
		// корректировка счетчиков
		var processed_tstates = _cpu.get_tstates();
		intrq_tstates_backcounter -= processed_tstates;
		performance_tstates += processed_tstates;
	}	

	function update_tstates_per_ms() {
		tstates_per_ms = tstatesPerIntrq / intrqPeriod;
	}

	/********************/
	/* public interface */
	/********************/
	this.run = run;
	this.stop = stop;
	this.get_running = function () { return running; }
	this.connect = function (bus, cpu) {
		_bus = bus;
		_cpu = cpu;

		_bus.on_opt(function (name, value) {
			tstatesPerIntrq = value;
			update_tstates_per_ms();
		}, OPT_TSTATES_PER_INTRQ);
	
		_bus.on_opt(function (name, value) {
			intrqPeriod = value; 
			update_tstates_per_ms();
		}, OPT_INTRQ_PERIOD);
	}
}