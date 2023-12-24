function ZX_Clock() {
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
	var tstatesPerMs = 3500;
	// флаг работы рабочего цикла
	var running = false;
	// идентификатор интервала рабочего цикла
	var intervalId;
	// время запуска последней итерации рабочего цикла
	var intervalTimestamp;
	// время последнего вывода информации о производительности
	var performanceTimestamp;
	// счетчик тактов с последнего вывода информации о производительности
	var performanceTstates;
	// счетчик фреймов (прерываний) с последнего вывода инфорамции о производительности
	var performanceFps;
	// счетчик тактов с начала работы
	var tstates = 0;

	var _bus;
	var _cpu;
	var _taskQueue = new TaskQueue(tstatesPerMs);
	var _interruptTask = null;
	var _rescheduleTaskOnNextInterrupt = false;

	var debug = false;
	var _checkBreakConditionCallback = function (state) { return false; }
	var _stopCallback = function () { }

	function run() {
		if ( running || !_bus || !_cpu )
			return;
		debug = false;
		running = true;
		var now = Date.now();
		intervalId = setInterval(process, 4);
		intervalTimestamp = now;
		performanceTimestamp = now;
		performanceTstates = 0;
		performanceFps = 0;
	}

	function runDebug(checkBreakConditionCallback, stopCallback) {
		if ( running || !_bus || !_cpu)
			return;
		debug = true;
		running = true;
		var now = Date.now();
		intervalId = setInterval(processDebug, 4);
		intervalTimestamp = now;
		performanceTimestamp = now;
		performanceTstates = 0;
		performanceFps = 0;
		_checkBreakConditionCallback = checkBreakConditionCallback;
		_stopCallback = stopCallback;
	}

	function stop() {
		if ( !running )
			return;
		running = false;
		clearInterval(intervalId);
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
		var performanceElapsed = now - performanceTimestamp
		if ( performanceElapsed >= 1000 ) {
			_bus.var_write('performance', {
				frequency: performanceTstates / (performanceElapsed * 1000),
				fps: performanceFps * 1000 / performanceElapsed
			});
			performanceTimestamp = now;
			performanceTstates = 0;
			performanceFps = 0;
		}
		// расчет времени с запуска предыдущей итерации
		var elapsed = now - intervalTimestamp;
		intervalTimestamp = now;
		// расчет количества тактов для выполнения
		var plannedTstates = tstatesPerMs * elapsed;
		if (plannedTstates > tstatesPerIntrq) {
			plannedTstates = tstatesPerMs * 4;
		}
		// сброс счетчика тактов процессора
		_cpu.set_tstates(0);
		var lastTstates = 0;
		var curTstates;
		// работа процессора
		while ((curTstates = _cpu.get_tstates()) < plannedTstates) {
			tstates += (curTstates - lastTstates);
			lastTstates = curTstates;
			_taskQueue.process(tstates);
			_cpu.process();
		}
		// корректировка счетчиков
		tstates += (curTstates - lastTstates);
		lastTstates = curTstates;
		performanceTstates += curTstates;
	}
	
	function processDebug() {
		// фиксация время запуска итерации
		var now = Date.now();
		// проверка на необходимость вывода информации о производительности.
		var performanceElapsed = now - performanceTimestamp
		if ( performanceElapsed >= 1000 ) {
			_bus.var_write('performance', {
				frequency: performanceTstates / (performanceElapsed * 1000),
				fps: performanceFps * 1000 / performanceElapsed
			});
			performanceTimestamp = now;
			performanceTstates = 0;
			performanceFps = 0;
		}
		// расчет времени с запуска предыдущей итереации
		var elapsed = now - intervalTimestamp;
		intervalTimestamp = now;
		// расчет количества тактов для выполнения
		var plannedTstates = tstatesPerMs * elapsed;
		if (plannedTstates > tstatesPerIntrq) {
			plannedTstates = tstatesPerMs * 4;
		}
		// сброс счетчика тактов процессора
		_cpu.set_tstates(0);
		var lastTstates = 0;
		var curTstates;
		// работа процессора
		while ((curTstates = _cpu.get_tstates()) < plannedTstates) {
			tstates += (curTstates - lastTstates);
			lastTstates = curTstates;
			_taskQueue.process(tstates);
			var state = _cpu.get_state();
			if (_checkBreakConditionCallback(state)) {
				stop();
				return;
			}			
			_cpu.process();
		}
		// корректировка счетчиков
		var processedTstates = (curTstates = _cpu.get_tstates());
		tstates += (curTstates - lastTstates);
		lastTstates = curTstates;
		performanceTstates += processedTstates;
	}

	var rescheduleInterruptTask = function() {
		_interruptTask && (_interruptTask.cancelled = true);
		_interruptTask = this.setInterval(onInterrupt, intrqPeriod, 0);
	}.bind(this);

	function onInterrupt() {
		_bus.var_write('intrq');
		performanceFps++;
		if (_rescheduleTaskOnNextInterrupt) {
			rescheduleInterruptTask();
			_rescheduleTaskOnNextInterrupt = false;
		}
	}

	function updateTstatesPerMs() {
		tstatesPerMs = tstatesPerIntrq / intrqPeriod;
		_taskQueue.set_tstatesPerMs(tstatesPerMs);
		_rescheduleTaskOnNextInterrupt = true;
	}

	/********************/
	/* public interface */
	/********************/
	this.run = run;
	this.runDebug = runDebug;
	this.stop = stop;
	this.get_running = function () { return running; }
	this.get_tstates = function () { return tstates; }
	this.get_ms = function () { return tstates / tstatesPerMs; }
	this.connect = function (bus, cpu) {
		_bus = bus;
		_cpu = cpu;

		_bus.on_opt(function (name, value) {
			tstatesPerIntrq = value;
			updateTstatesPerMs();
		}, OPT_TSTATES_PER_INTRQ);
	
		_bus.on_opt(function (name, value) {
			intrqPeriod = value; 
			updateTstatesPerMs();
		}, OPT_INTRQ_PERIOD);

		rescheduleInterruptTask();
	}
	this.setTimeout = function(func, ms) {
		return _taskQueue.enqueue(tstates, ms, func);
	}
	this.setInterval = function (func, interval, count, firstInterval) {
		var firstInterval = (firstInterval !== undefined) ? firstInterval : interval;
		return _taskQueue.enqueue(tstates, firstInterval, func, count, interval);
	}
}

function TaskQueue(tstatesPerMs) {
	// вместимость очереди ставим с запасом
	// (фактически одномоментно там порядка 5 заданий)
	var capacity = 100; 
	var queue = new Array(capacity);
	var begin = 0;
	var end = 0;
	var _tstatesPerMs = tstatesPerMs;

	this.set_tstatesPerMs = function (value) {
		_tstatesPerMs = value;
		var linearEnd = end < begin ? end + capacity : end;
		for (var linearIndex = begin; linearIndex < linearEnd; linearIndex++) {
			var task = queue[linearIndex % capacity];
			if (!task.valuesInTs && task.recalculateOnMsChanged) {
				task.recalculate = true;
			}
		}
	}
	this.get_tstatesPerMs = function () {
		return _tstatesPerMs;
	}

	this.enqueue = function (tsNow, timeout, func, count, repeatInterval, valuesInTs) {
		// init task
		var task = {
			tsStart: tsNow,
			tsEvent: tsNow + (valuesInTs ? timeout : (timeout * _tstatesPerMs)),
			timeout: timeout,
			next: 1,
			count: count !== undefined ? count : 1,
			repeatInterval: repeatInterval !== undefined ? repeatInterval : timeout,
			valuesInTs: valuesInTs !== undefined ? valuesInTs : false,
			invoke: func,
			recalculateOnMsChanged: !valuesInTs,
			cancelled: false,
			recalculate: false
		};
		// put in queue
		var linearEnd = end < begin ? end + capacity : end;
		var i = linearEnd;
		while ((i - 1) >= begin && queue[(i - 1) % capacity].tsEvent > task.tsEvent) {
			queue[i % capacity] = queue[(i - 1) % capacity];
			i--;
		}
		queue[i % capacity] = task;
		end = (end + 1) % capacity;
		return task;
	}

	this.reenqueue = function (task) {
		// update task
		if (task.recalculate) {
			task.tsStart = task.tsEvent;
			task.timeout = 0;
			if (task.count) {
				task.count -= (task.next - 1);
			}
			task.next = 1;
			task.recalculate = false;
		}
		task.tsEvent = task.tsStart + (
			task.valuesInTs 
			? (task.timeout + task.next * task.repeatInterval)
			: (task.timeout + task.next * task.repeatInterval) * _tstatesPerMs);
		task.next++;
		// put in queue
		var linearEnd = end < begin ? end + capacity : end;
		var i = linearEnd;
		while ((i - 1) >= begin && queue[(i - 1) % capacity].tsEvent > task.tsEvent) {
			queue[i % capacity] = queue[(i - 1) % capacity];
			i--;
		}
		queue[i % capacity] = task;
		end = (end + 1) % capacity;
		return task;
	}

	this.process = function (tsNow) {
		while (true) {
			var linearEnd = end < begin ? end + capacity : end;
			if (begin < linearEnd && queue[begin].tsEvent <= tsNow) {
				var task = queue[begin++];
				begin %= capacity;
				if (!task.cancelled) {
					task.invoke();
					if (!task.cancelled && (!task.count || task.next < task.count)) {
						this.reenqueue(task);
					}
				}
			}
			else 
				break;
		}
	}

}