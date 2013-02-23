# ZX-Dream
[Русский](#russian)  
[English](#english)  

----------

## Russian

Эмулятор ZX Spectrum на JavaScript

Реализована эмуляция следующего оборудования:

- процессор Z80 (включая большинство недокументированных особенностей)
- ПЗУ с переключением страниц 48/Turbo/128/TR-DOS
- ОЗУ общим объемом 512 Кб, реализованное по схеме Pentagon (через порт #7FFD)
- интерфейс Beta Disk
- дисплей с возможностью переключения отображения из 5 или 7 страницы памяти (через порт #7FFD)
- 40-клавишная клавиатура
- Kempston-мышка (с виртуальным управлением)

Другие возможности:

- открытие и сохранение образов в форматах TRD, FDI, SCL
- открытие и сохранение снимков SNA

Вы можете взглянуть на эмулятор здесь: [ZX Spectrum online emulator](http://zx.researcher.su/)

### Формат исходных файлов

Исходный код эмулятора находится в папке *modules*. Часть файлов имеет расширение *html*, но на самом деле являются
модулями, которые могут содержать HTML-шаблоны, CSS-стили к этим шаблонам и JS-код, необходимые для обеспечения
соответствующей функциональности. Также модули могут включать в себя другие модули. При сборке весь результирующий
код оказывается в двух файлах: *css\spectrum.css* и *js\spectrum.js*.

### Сборка

Для сборки необходимо наличие на компьютере командной оболочки PowerShell 2.0. Если на компьютере установлена среда
выполнения Java, то также будет произведена минификация JS-кода в файл *js\spectrum.min.js*. Чтобы выполнить сборку,
необходимо выполнить файл *build.cmd* в корне проекта. (Возможно, понадобится ещё разрешить выполнение скиптов 
PowerShell, выполнив в оболочке команду: *Set-ExecutionPolicy -ExecutionPolicy RemoteSigned*.)


## English

ZX Spectrum emulator in JavaScript

The next hardware emulation was implemented:

- processor Z80 (including most of the undocumented features)
- ROM with page switching 48/Turbo/128/TR-DOS
- RAM with the total amount of 512 KB. Implemented according to the Pentagon scheme (via the port #7FFD)
- Beta Disk interface
- display with the capability to switch the source memory page: 5 or 7 (via the port #7FFD)
- 40-key keyboard
- Kempston-mouse (virtual control)

Other capabilities:

- open and save images in TRD, FDI, SCL formats
- open and save SNA snapshots

You can take a look on the emulator here: [ZX Spectrum online emulator](http://zx.researcher.su/)

### Source file format

The emulator source code is placed in the *modules* directory. A part of the files has *html* extension, but 
actually these files have the module format. Modules can contain HTML-template, CSS-styles and JS-code required for 
supporting the corresponding functionality. Also modules can include the other ones. While the build process is 
being performed the entire result code goes into the *css\spectrum.css* and *js\spectrum.js* files.

### Build process

To build, the PowerShell 2.0 must be installed. Also JS code will be minified into the *js\spectrum.min.js* file if
Java runtime environment is presented on the computer. In order to build the project, you have to run *build.cmd* 
file that is placed at the top directory. (Probably also the next command must be executed in the shell: 
*Set-ExecutionPolicy-ExecutionPolicy RemoteSigned*.)