function ZX_Clock() {

	var _bus;
	var _cpu;
	var _timeoutQueue = new TimeoutQueue();
	var _interruptSubscription = null;

	/*
	 * Вроде как, в Pentagon прерывание происходит каждые 71680 тактов.
	 * При частоте 3.5МГц это означает, что:
	 *   частота прерываний равна 48.828125 Гц,
	 *   период прерываний равен 20.48 мс
	 */

	// период запросов маскируемого прерывания в миллисекундах
	var intrqPeriod = 20.48;
	// количество выполняемых процессором тактов между маскируемыми прерываниями
	var tstatesPerIntrq = 71680;
	// количество выполняемых процессором тактов за одну миллисекунду
	var tstates_per_ms = 3500;
	// флаг работы рабочего цикла
	var running = false;
	// идентификатор интервала рабочего цикла
	var interval_id;
	// время запуска последней итерации рабочего цикла
	var interval_timestamp;
	// время последнего вывода информации о производительности
	var performance_timestamp;
	// счетчик тактов с последнего вывода информации о производительности
	var performance_tstates;
	// счетчик фреймов (прерываний) с последнего вывода инфорамции о производительности
	var performance_fps;
	// счетчик тактов с начала работы
	var tstates = 0;
	var resubscribeOnInterrupts = false;

	var debug = false;
	var _checkBreakConditionCallback = function (state) { return false; }
	var _stopCallback = function () { }

	function run() {
		if ( running || !_bus || !_cpu )
			return;
		debug = false;
		running = true;
		var now = Date.now();
		interval_id = setInterval(process, 4);
		interval_timestamp = now;
		performance_timestamp = now;
		performance_tstates = 0;
		performance_fps = 0;
	}

	function runDebug(checkBreakConditionCallback, stopCallback) {
		if ( running || !_bus || !_cpu)
			return;
		debug = true;
		running = true;
		var now = Date.now();
		interval_id = setInterval(processDebug, 4);
		interval_timestamp = now;
		performance_timestamp = now;
		performance_tstates = 0;
		performance_fps = 0;
		_checkBreakConditionCallback = checkBreakConditionCallback;
		_stopCallback = stopCallback;
	}

	function stop() {
		if ( !running )
			return;
		running = false;
		clearInterval(interval_id);
		if (debug) {
			_stopCallback();
		}
	}

	// Принцип выполнения итерации следующий:
	// 1. Вычисляется время, прошедшее с последней фиксации информации о производительности.
	// 2. Если время из п.1 достигло секунды, то рассчитывается примерная частота работы 
	//    процессора и количество фреймов (прерываний), выполненных за это время. После этого
	//	  время и счетчики производительности начинают считаться заново.
	// 3. Вычисляется количество миллисекунд, прошедших со времени запуска предыдущей итерации.
	// 4. Вычисляется количество тактов процессора, которое должно было отработать за время из п.1.
	//    При этом, если количество тактов процессора получилось слишком большое (превышает 
	//    количество тактов между прерываниями), то в качестве значения берется количество тактов,
	//    обрабатываемых за 4 мс. Это нужно для случаев, когда пользователь переключется со вкладки
	//    эмулятора на дргие вкладки или в другие приложения. В этом случае рабочий цикл
	//    приостанавливается и интервал между итерациями может оказаться таким большим, что попытка
	//    обработать столько тактов за одну итерацию приведет к зависанию вкладки. 
	// 5. Прерывания реализуются путем планирования в общей очереди событий. Время возникнования
	//    очередного запланированного события рассчитывается, исходя из количества выполненных тактов
	//    процессора и его тактовой частоты.
	// 6. В процессе выполнения итерации в нужных случаях корректируются счетчики производительности,
	//    тактов и т.п.
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
		// расчет времени с запуска предыдущей итерации
		var elapsed = now - interval_timestamp;
		interval_timestamp = now;
		// расчет количества тактов для выполнения
		var planned_tstates = tstates_per_ms * elapsed;
		if (planned_tstates > tstatesPerIntrq) {
			planned_tstates = tstates_per_ms * 4;
		}
		// сброс счетчика тактов процессора
		_cpu.set_tstates(0);
		var lastTstates = 0;
		var curTstates;
		// работа процессора
		while ((curTstates = _cpu.get_tstates()) < planned_tstates) {
			tstates += (curTstates - lastTstates);
			lastTstates = curTstates;
			_timeoutQueue.process(tstates);
			_cpu.process();
		}
		// корректировка счетчиков
		tstates += (curTstates - lastTstates);
		lastTstates = curTstates;
		performance_tstates += curTstates;
	}
	
	function processDebug() {
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
		// расчет времени с запуска предыдущей итереации
		var elapsed = now - interval_timestamp;
		interval_timestamp = now;
		// расчет количества тактов для выполнения
		var planned_tstates = tstates_per_ms * elapsed;
		if (planned_tstates > tstatesPerIntrq) {
			planned_tstates = tstates_per_ms * 4;
		}
		// сброс счетчика тактов процессора
		_cpu.set_tstates(0);
		var lastTstates = 0;
		var curTstates;
		// работа процессора
		while ((curTstates = _cpu.get_tstates()) < planned_tstates) {
			tstates += (curTstates - lastTstates);
			lastTstates = curTstates;
			_timeoutQueue.process(tstates);
			var state = _cpu.get_state();
			if (_checkBreakConditionCallback(state)) {
				stop();
				return;
			}			
			_cpu.process();
		}
		// корректировка счетчиков
		var processed_tstates = (curTstates = _cpu.get_tstates());
		tstates += (curTstates - lastTstates);
		lastTstates = curTstates;
		performance_tstates += processed_tstates;
	}

	var updateInterruptSubscription = function() {
		if (_interruptSubscription) {
			_interruptSubscription.cancel();
		}
		_interruptSubscription = this.subscribe(onInterrupt, intrqPeriod, 0);
	}.bind(this);

	function onInterrupt() {
		_bus.var_write('intrq');
		performance_fps++;
		if (resubscribeOnInterrupts) {
			updateInterruptSubscription();
			resubscribeOnInterrupts = false;
		}
	}

	function update_tstates_per_ms() {
		tstates_per_ms = tstatesPerIntrq / intrqPeriod;
		resubscribeOnInterrupts = true;
	}

	/********************/
	/* public interface */
	/********************/
	this.run = run;
	this.runDebug = runDebug;
	this.stop = stop;
	this.get_running = function () { return running; }
	this.get_tstates = function () { return tstates; }
	this.get_ms = function () { return tstates / tstates_per_ms; }
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

		updateInterruptSubscription();
	}
	this.setTimeout = function(func, ms) {
		return _timeoutQueue.enqueue(tstates + ms * tstates_per_ms, func);
	}
	this.setInterval = function(func, ms) {
		var state = {
			func: func,
			ms: ms,
			init: tstates,
			iter: 0,
			rec: null,
			getNextTstates: function () { return this.init + ++this.iter * this.ms * tstates_per_ms; }
		};
		state.rec = _timeoutQueue.enqueue(state.getNextTstates(), execAndReqenqueue.bind(null, state));
		return state.rec;

		function execAndReqenqueue(state) {
			state.func();
			var rec2 = _timeoutQueue.enqueue(state.getNextTstates(), execAndReqenqueue.bind(null, state));
			rec2.cancelled = state.rec.cancelled;
		}
	}
	this.subscribe = function (func, interval, count, firstInterval) {
		var state = {
			func: func,
			start: tstates,
			interval: interval,
			firstInterval: firstInterval !== undefined ? firstInterval : interval,
			count: count !== undefined ? count : 1,
			next: 1,
			cancelled: false,
			underlyingTimeout: null,
			get_leftOver: function () {
				if (this.underlyingTimeout) {
					return (this.underlyingTimeout.tstates - tstates) / tstates_per_ms;
				}
				else {
					return 0;
				}
			},
			cancel: function () { 
				this.cancelled = true; 
				if (this.underlyingTimeout) { 
					this.underlyingTimeout.cancelled = true; 
				} 
			}
		};
		state.underlyingTimeout = _timeoutQueue.enqueue(state.start + state.firstInterval * tstates_per_ms, onTimeout.bind(state));
		return state;

		function onTimeout() {
			this.func();
			if (this.cancelled || this.count && this.next >= this.count)
				return;

			this.underlyingTimeout = _timeoutQueue.enqueue(this.start + (this.firstInterval + this.next++ * this.interval) * tstates_per_ms, onTimeout.bind(this));
		}
	}
}

function TimeoutQueue() {
	// вместимость очереди ставим с запасом
	// (фактически одномоментно там порядка 5 заданий)
	var capacity = 100; 
	var queue = new Array(capacity);
	var begin = 0;
	var end = 0;

	this.enqueue = function (tstates, func) {
		var linearEnd = end < begin ? end + capacity : end;
		var i = linearEnd;
		while ((i - 1) >= begin && queue[(i - 1) % capacity].tstates > tstates) {
			queue[i % capacity] = queue[(i - 1) % capacity];
			i--;
		}
		var state = queue[i % capacity] = {
			tstates: tstates,
			func: func,
			cancelled: false,
			cancel: function () { this.cancelled = true; }
		};
		end = (end + 1) % capacity;
		return state;
	}

	this.process = function (tstates) {
		while (true) {
			var linearEnd = end < begin ? end + capacity : end;
			if (begin < linearEnd && queue[begin].tstates <= tstates) {
				var state = queue[begin++];
				begin %= capacity;
				if (!state.cancelled) {
					state.func();
				}
			}
			else 
				break;
		}
	}

}