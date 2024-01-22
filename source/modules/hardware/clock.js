function ZX_Clock() {
	/*
	 * Вроде как, в Pentagon прерывание происходит каждые 71680 тактов.
	 * При частоте 3.5МГц это означает, что:
	 *   частота прерываний равна 48.828125 Гц,
	 *   период прерываний равен 20.48 мс
	 */

	// период запросов маскируемого прерывания в миллисекундах
	var intrqPeriod = 20.48;
	// продолжлительность сигнала прерывания в тактах процессора
	var intrqDurationTstates = 32;
	// количество выполняемых процессором тактов между маскируемыми прерываниями
	var tstatesPerIntrq = 71680;
	// количество выполняемых процессором тактов за одну миллисекунду
	var tstatesPerMs = 3500;
	// флаг работы рабочего цикла
	var running = false;
	// идентификатор интервала рабочего цикла
	var intervalId;
	// точка отсчета работы тактового генератора в тактах
	var baseTstates;
	// точка отсчета работы тактового генератора
	var baseTimestamp;
	// время последнего вывода информации о производительности
	var performanceTimestamp;
	// счетчик тактов с последнего вывода информации о производительности
	var performanceTstates;
	// счетчик фреймов (прерываний) с последнего вывода инфорамции о производительности
	var performanceFps;
	// счетчик тактов с начала работы
	var tstates = 0;
	// максимальное ускорение (после временного спада производительности)
	var maxBoostMs = 50.0;
	var maxBoostTstates = maxBoostMs * tstatesPerMs;

	var _bus;
	var _cpu;
	var _taskQueue = new TaskQueue(tstatesPerMs);
	var _interruptActiveTask = null;
	var _interruptInactiveTask = null;
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
		baseTstates = tstates;
		baseTimestamp = now;
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
		baseTstates = tstates;
		baseTimestamp = now;
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
	// 3. Вычисляется количество прошедших реальных миллисекунд с точки отсчета (изначально это время запуска тактового генератора).
	// 4. Вычисляется количество фактически выполненных тактов процессора с точки отсчета.
	// 5. Учитывая текущие настройки тактового генератора вычисляется количество тактов, которое должно было быть выполнено за реально время из п.3.
	// 6. Разница между значениями, полученными в п.5 и п.4, является количеством тактов, подлежащих выполнению в текущей итерации.
	//    При этом, если количество тактов процессора получилось слишком большое (превышает maxBoostTstates), то точка отсчета сдвигается вперед
	//	  таким образом, что будет выполнено только maxBoostTstates тактов, а дальше эмулация продолжится со штатной скоростью. Это нужно для случаев, 
	//	  когда пользователь переключется со вкладки эмулятора на дргие вкладки или в другие приложения. В этом случае рабочий цикл
	//    приостанавливается и интервал между итерациями может оказаться таким большим, что попытка обработать столько тактов за одну итерацию приведет
	//    к зависанию вкладки. Аудио-буфер также будет переполняться до нормализации скорости эмуляции.
	// 7. Прерывания реализуются путем планирования в общей очереди событий. Время возникнования
	//    очередного запланированного события рассчитывается, исходя из количества выполненных тактов
	//    процессора и его тактовой частоты.
	// 8. В процессе выполнения итерации в нужных случаях корректируются счетчики производительности,
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
		// время с точки отсчета
		var elapsed = now - baseTimestamp;
		// соответствие этого времени тактам
		var elapsedTstates = tstatesPerMs * elapsed;
		// количество тактов для выполнения в текущей итерации
		var plannedTstates = elapsedTstates - (tstates - baseTstates);
		if (plannedTstates > maxBoostTstates) {
			// Если замедление более, чем максимально возможное компенсационное
			// ускорение, то точка отсчета во времени сдвигается вперед так,
			// что далее компенсируется только максимально возможное ускорение.
			// Далее эмуляция пойдет со штатной скоростью.
			baseTimestamp += (plannedTstates / tstatesPerMs - maxBoostMs);
			plannedTstates = maxBoostTstates;
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
		// время с точки отсчета
		var elapsed = now - baseTimestamp;
		// соответствие этого времени тактам
		var elapsedTstates = tstatesPerMs * elapsed;
		// количество тактов для выполнения в текущей итерации
		var plannedTstates = elapsedTstates - (tstates - baseTstates);
		if (plannedTstates > maxBoostTstates) {
			// Если замедление более, чем максимально возможное компенсационное
			// ускорение, то точка отсчета во времени сдвигается вперед так,
			// что далее компенсируется только максимально возможное ускорение.
			// Далее эмуляция пойдет со штатной скоростью.
			baseTimestamp += (plannedTstates / tstatesPerMs - maxBoostMs);
			plannedTstates = maxBoostTstates;
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
		_interruptActiveTask && (_interruptActiveTask.cancelled = true);
		_interruptInactiveTask && (_interruptInactiveTask.cancelled = true);
		_interruptActiveTask = this.setInterval(onInterruptActive, intrqPeriod, 0);
		_interruptInactiveTask = this.setInterval(onInterruptInactive, intrqPeriod, 0, intrqDurationTstates / tstatesPerMs);
	}.bind(this);

	function onInterruptActive() {
		_bus.var_write('intrq', 1);
		performanceFps++;
		if (_rescheduleTaskOnNextInterrupt) {
			rescheduleInterruptTask();
			_rescheduleTaskOnNextInterrupt = false;
		}
	}

	function onInterruptInactive() {
		_bus.var_write('intrq', 0);
	}

	function updateTstatesPerMs() {
		tstatesPerMs = tstatesPerIntrq / intrqPeriod;
		_taskQueue.set_tstatesPerMs(tstatesPerMs);
		maxBoostTstates = maxBoostMs * tstatesPerMs;
		baseTstates = tstates;
		baseTimestamp = Date.now();
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