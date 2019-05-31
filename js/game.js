function Game()
{
	this.viewport_x = 0;
	this.viewport_y = 0;
	this.viewport_move_x = 0;
	this.viewport_move_y = 0;
	this.viewport_move_mouse_x = 0;
	this.viewport_move_mouse_y = 0;
	this.viewport_ctx = {};
	
	this.paused = false;
	this.started = false;
	
	this.resources = new ResourseLoader();
	
	this.players = [];
	this.objects = [];
	this.effects = [];
	this.map_elements = [];
	this.kill_objects = [];
	this.selected_objects = [];
	this.selected_info = {};
	this.tactical_groups = {};
	this.fontDraw = null;
	
	//Drawers
	this.objDraw = new ObjectDraw();
	this.dialog = new InterfaceDialog();
	
	//Flags
	this.action_state = 0;
	this.action_state_options = {};
	this.interface_update_time = 0;
	this.minimap_navigation = false;
	
	this.debug = new Debuger();
	
	this.addPlayer = function(player)
	{
		this.players[player.type] = player;
	};
	
	this.moveViewport = function(x, y, relative)
	{
		if (relative)
		{
			this.viewport_x += x*CELL_SIZE;
			this.viewport_y += y*CELL_SIZE;
		}
		else
		{
			this.viewport_x = x*CELL_SIZE;
			this.viewport_y = y*CELL_SIZE;
		}
		
		if (this.viewport_x < 0)
			this.viewport_x = 0;
		if (this.viewport_y < 0)
			this.viewport_y = 0;
		if (this.viewport_x > CurrentLevel.max_movement.x)
			this.viewport_x = CurrentLevel.max_movement.x;
		if (this.viewport_y > CurrentLevel.max_movement.y)
			this.viewport_y = CurrentLevel.max_movement.y;
		
		$('#map_view, #map_fog').css({
			left: -this.viewport_x,
			top: -this.viewport_y
		}, 'fast');
		
		InterfaceMinimap.drawViewport();
	};
	
	this.init = function(init_finish_callback)
	{
		if (!BrowserCheck.check())
		{
			BrowserCheck.standartMessage();
			return;
		}
		
		var level = window.location.hash || '#fg1';
		level = level.substr(1);
		this.resources.loadScript('./js/levels/' + level + '/map.js', function(){
			game.initLevel(init_finish_callback);
		});
	};

	this.initLevel = function(init_finish_callback)
	{
		this.viewport_ctx = $('#viewport').get(0).getContext('2d');
		
		var levelBuilder = new LevelBuilder(CurrentLevel);
		levelBuilder.build();
		
		$('#minimap_viewport, #minimap_objects')
			.attr('width', CurrentLevel.minimap.x)
			.attr('height', CurrentLevel.minimap.y);
		
		DamageTable.init();
		
		//Interface init
		InterfaceConstructManager.init(CurrentLevel.getAvailableUnits(), CurrentLevel.getAvailableBuildings());
		InterfaceMoneyDraw.init();
		InterfaceEnergyWaterDraw.init();
		InterfaceMinimap.init();
		InterfaceFogOfWar.init();
		MousePointer.init();
		
		//Preloading images
		InterfaceGUI.preloadImages();
		levelBuilder.loadMapElements();
		this._loadGameResources();
		this.resources.onLoaded = function(loaded, total){
			var progress = parseInt(500/total*loaded);
			$('#progress-bar').css({width: progress+'px'});
		};
		this.resources.onComplete = function(){
			game.fontDraw = new FontDraw('font', 14);
			
			//Init units
			CurrentLevel.getInitUnits();
		
			game.moveViewport(CurrentLevel.start_positions[0].x - 10, CurrentLevel.start_positions[0].y - 10, false);
			InterfaceConstructManager.drawUnits();
			levelBuilder.generateMap();
			game._resetSelectionInfo();
			InterfaceEnergyWaterDraw.drawAll();
			InterfaceMinimap.switchState();
			InterfaceMusicPlayer.start();
			
			$('.load-screen').hide();
			$('.game').show();
			
			this.started = true;
			init_finish_callback();
		};
	};
	
	this.run = function()
	{
		if (this.paused)
			return;
		
		var i;
		
		//Debug
		this.debug.countRun();
		
		//Kill objects
		for (i = 0; i<this.kill_objects.length; ++i)
		{
			var unit = this.objects[this.kill_objects[i]];
			
			if (typeof unit === 'undefined')
				continue;
			
			unit.onObjectDeletion();
			
			//Remove user from selected array
			var sindex = this.selected_objects.indexOf(unit.uid);
			if (sindex != -1)
				this.selected_objects.splice(sindex, 1);
			
			//Delete object
			this.objects[this.kill_objects[i]] = null;
			delete this.objects[this.kill_objects[i]];
		}
		this.kill_objects = [];
		
		//Proceed objects
		for (i in this.objects)
			this.objects[i].run();
		
		//Move viewport
		var move_x = this.viewport_move_x, move_y = this.viewport_move_y;
		if (this.debug.mouse_panning && MousePointer.show_cursor)
		{
			if (this.viewport_move_mouse_x != 0)
				move_x = this.viewport_move_mouse_x;
			if (this.viewport_move_mouse_y != 0)
				move_y = this.viewport_move_mouse_y;
		}
		if (move_x!=0 || move_y!=0)
			this.moveViewport(move_x, move_y, true);
		
		//Money draw
		InterfaceMoneyDraw.draw();
	};
	
	this.draw = function()
	{
		if (!this.paused)
			this._draw();
		
		window.requestAnimFrame(function(){
			game.draw();
		});
	};
	
	this._draw = function()
	{
		var cur_time = (new Date()).getTime(), onscreen = [], unitid, eindex, mapelem_onscreen = [];
		var top_x = parseInt(this.viewport_x / CELL_SIZE) - 1, top_y = parseInt(this.viewport_y / CELL_SIZE) - 1;
		
		//Debug
		this.debug.countDraw();
		
		this.viewport_ctx.clearRect(0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);
		MousePointer.clearView();
		this.objDraw.clear();
		
		//Detect onscreen units
		for (var y=0; y<21; ++y)
			for (var x=0; x<21; ++x)
			{
				if (CurrentLevel.map_cells[top_x+x] && CurrentLevel.map_cells[top_x+x][top_y+y])
				{
					//Preventing duplicate entries (for example building can be placed in few cells)
					
					if (CurrentLevel.map_cells[top_x+x][top_y+y].map_element != -1)
						mapelem_onscreen[CurrentLevel.map_cells[top_x+x][top_y+y].map_element] = 1;
					if (CurrentLevel.map_cells[top_x+x][top_y+y].building != -1)
						onscreen[CurrentLevel.map_cells[top_x+x][top_y+y].building] = 1;
					
					if (CurrentLevel.map_cells[top_x+x][top_y+y].fog == 0)
						continue;
					
					if (CurrentLevel.map_cells[top_x+x][top_y+y].ground_unit != -1)
					{
						onscreen[CurrentLevel.map_cells[top_x+x][top_y+y].ground_unit] = 1;
						//console.log('Unit %s on position %s:%s', CurrentLevel.map_cells[top_x+x][top_y+y].ground_unit, top_x+x, top_y+y);
					}
					if (CurrentLevel.map_cells[top_x+x][top_y+y].fly_unit != -1)
						onscreen[CurrentLevel.map_cells[top_x+x][top_y+y].fly_unit] = 1;
				}
			}
			
		//Round 1: Put units to draw heap
		for (unitid in onscreen)
			if (this.objects[unitid] !== undefined)
				this.objects[unitid].draw(cur_time);
		
		//Round 1.1: Put map elements to draw heap
		for (eindex in mapelem_onscreen)
			this.map_elements[eindex].draw();
		
		//Round 1.5: Put effects to draw heap
		for (eindex in this.effects)
			this.objects[this.effects[eindex]].draw(cur_time);
		
		//Round 2: Draw all entries in draw heap
		this.objDraw.draw();
		
		//Round 3: Draw selections
		for (unitid in onscreen)
			if (this.objects[unitid].is_selected)
				this.objects[unitid].drawSelection();
		
		//Round 4: On mouse selection
		var mouse_pos = MousePointer.getCellPosition();
		unitid = -1;
		if (MapCell.isCorrectCord(mouse_pos.x, mouse_pos.y) && CurrentLevel.map_cells[mouse_pos.x][mouse_pos.y].fog>0)
			unitid = MapCell.getSingleUserId(CurrentLevel.map_cells[mouse_pos.x][mouse_pos.y]);
		if (unitid != -1) // && !this.objects[unitid].is_selected)
			this.objects[unitid].drawSelection(true);
		
		//Round 5: Update fog of war
		InterfaceFogOfWar.redrawFog();
		
		//DEBUG: Unit placement
		if (this.debug.show_obj)
		{
			this.viewport_ctx.fillStyle = 'rgba(0, 0, 255, 0.3)';
			var start_x = parseInt(this.viewport_x/CELL_SIZE), start_y = parseInt(this.viewport_y/CELL_SIZE);
			for (var x=0; x<CELLS_WIDTH; ++x)
			{
				if (CurrentLevel.map_cells[start_x+x] === undefined)
					continue;
				
				for (var y=0; y<CELLS_HEIGTH; ++y)
				{
					if (CurrentLevel.map_cells[start_x+x][start_y+y] === undefined)
						continue;
					
					if (MapCell.getSingleUserId(CurrentLevel.map_cells[start_x+x][start_y+y]) != -1)
						this.viewport_ctx.fillRect((start_x+x)*CELL_SIZE-this.viewport_x + CELL_SIZE/2, (start_y+y)*CELL_SIZE-this.viewport_y + CELL_SIZE/2, CELL_SIZE, CELL_SIZE);
				}
			}
		}

		//DEBUG: Ground type
		if (this.debug.show_type)
		{
			var start_x = parseInt((this.viewport_x-CELL_SIZE/2)/CELL_SIZE), start_y = parseInt((this.viewport_y-CELL_SIZE/2)/CELL_SIZE/2), skip;
			for (var x=0; x<CELLS_WIDTH; ++x)
			{
				if (CurrentLevel.map_cells[start_x+x] === undefined)
					continue;
				
				for (var y=0; y<CELLS_HEIGTH; ++y)
				{
					if (CurrentLevel.map_cells[start_x+x][start_y+y] === undefined)
						continue;
					
					skip = false;
					switch (CurrentLevel.map_cells[start_x+x][start_y+y].type)
					{
						case CELL_TYPE_EMPTY:
							skip = true;
							break;
						case CELL_TYPE_TREE:
							this.viewport_ctx.fillStyle = 'rgba(0, 200, 0, 0.3)';
							break;
						case CELL_TYPE_WATER:
							this.viewport_ctx.fillStyle = 'rgba(0, 0, 255, 0.3)';
							break;
						case CELL_TYPE_NOWALK:
							this.viewport_ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
							break;
						case CELL_TYPE_BUILDING:
							this.viewport_ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
							break;
					}
					if (!skip)
						this.viewport_ctx.fillRect((start_x+x)*CELL_SIZE-this.viewport_x + CELL_SIZE/2, (start_y+y)*CELL_SIZE-this.viewport_y + CELL_SIZE/2, CELL_SIZE, CELL_SIZE);
				}
			}
		}

		//DEBUG: Cells grid
		if (this.debug.show_grid)
		{
			this.viewport_ctx.strokeStyle = '#ffffff';
			this.viewport_ctx.beginPath();
			var start = CELL_SIZE - (this.viewport_x - parseInt(this.viewport_x/CELL_SIZE)*CELL_SIZE) - 11.5; 
			for (var i=0; i<CELLS_WIDTH; ++i)
			{
				this.viewport_ctx.moveTo(start + i*CELL_SIZE, 0);
				this.viewport_ctx.lineTo(start + i*CELL_SIZE, VIEWPORT_SIZE);
			}
			start = CELL_SIZE - (this.viewport_y - parseInt(this.viewport_y/CELL_SIZE)*CELL_SIZE) - 11.5; 
			for (i=0; i<CELLS_WIDTH; ++i)
			{
				this.viewport_ctx.moveTo(0, start + i*CELL_SIZE);
				this.viewport_ctx.lineTo(VIEWPORT_SIZE, start + i*CELL_SIZE);
			}
			this.viewport_ctx.stroke();
		}

		//Mouse
		MousePointer.draw(cur_time);
		
		//Once per second update interface info
		if ((cur_time - this.interface_update_time) > 1000)
		{
			this.interface_update_time = cur_time;
			
			ActionsHeap.run();
			
			//Update producing canvases
			InterfaceConstructManager.redrawProductionState();
			
			//Update minimap
			InterfaceMinimap.drawObjects();
			
			//Energy
			InterfaceEnergyWaterDraw.enrgyNotification(cur_time);
			
			//Debug
			this.debug.resetCounters();
		}
		
		if (this.debug.show_fps)
			this.debug.drawFPS();
	};
	
	this.minimapNavigation = function(start)
	{
		this.minimap_navigation = start;
	};
	
	this.minimapMove = function(x, y)
	{
		if (!this.minimap_navigation)
			return;
		
		var delta = CurrentLevel.size.x / CurrentLevel.minimap.x,
			realx = parseInt((x-CurrentLevel.minimap.rect_x/2) * delta),
			realy = parseInt((y-CurrentLevel.minimap.rect_y/2) * delta);
			
		this.moveViewport(realx, realy, false);
	};
	
	this.onClick = function(button)
	{
		var pos = MousePointer.getCellPosition();
		
		if (button == 'left')
		{
			var cunit = MapCell.isFogged(pos) ? -1 : MapCell.getSingleUserId(CurrentLevel.map_cells[pos.x][pos.y]);
			if ((cunit !== -1) && this.objects[cunit].canBeSelected())
				this.regionSelect(pos.x, pos.y, pos.x, pos.y);
			
			//If not new selection move selected units
			if (cunit==-1 && this.selected_objects.length>0 && !this.selected_info.is_building)
				this.moveSelectedUnits(pos);
		}
		else
		{
			switch (this.action_state)
			{
				case ACTION_STATE_ATTACK:
					this.cleanActionState();
				case ACTION_STATE_NONE:
					this._deselectUnits();
					InterfaceConstructManager.drawUnits();
					break;
					
				default:
					this.cleanActionState();
					break;
			}
		}
	};
	
	this.moveSelectedUnits = function(pos)
	{
		for (var i in this.selected_objects)
			this.objects[this.selected_objects[i]].orderMove(pos.x, pos.y, (i==0));
	};
	
	this.regionSelect = function (x1, y1, x2, y2)
	{
		var x, y, cur_unit, play_sound = true;
		
		this._deselectUnits();
		
		//Select units
		for (x=x1; x<=x2; ++x)
			for (y=y1; y<=y2; ++y)
			{
				cur_unit = MapCell.getSingleUserId(CurrentLevel.map_cells[x][y]);
				if ((cur_unit !== -1) && this.objects[cur_unit].canBeSelected())
				{
					//Do not select buildings on multiselect
					if (this.objects[cur_unit].is_building && (x1!=x2 || y1!=y2))
						continue;
					
					this.objects[cur_unit].select(true, play_sound);
					play_sound = false;
					
					this.selected_objects.push(cur_unit);
				}
			}
		
		this.rebuildSelectionInfo();
	};
	
	this.rebuildSelectionInfo = function(skip_constructor)
	{
		var i, cur_unit, harvesters = true, humans_only = true, cyclones = true;
		
		for (i in this.selected_objects)
		{
			cur_unit = this.selected_objects[i];
			
			if (this.objects[cur_unit].is_building)
				this.selected_info.is_building = true;
			else
			{
				this.selected_info.min_mass = Math.min(this.selected_info.min_mass, this.objects[cur_unit]._proto.mass);
				harvesters = harvesters && this.objects[cur_unit].canHarvest();
				cyclones = cyclones && (this.objects[cur_unit]._proto == CycloneUnit);
				humans_only = humans_only && this.objects[cur_unit].isHuman();
				this.selected_info.move_mode = Math.max(this.selected_info.move_mode, this.objects[cur_unit]._proto.move_mode);
				this.selected_info.move_mode_min = Math.min(this.selected_info.move_mode, this.objects[cur_unit]._proto.move_mode);
				
				if (i == 0)
					this.selected_info.tactic_info = cloneObj(this.objects[cur_unit].tactic);
				else
				{
					if (this.objects[cur_unit].tactic.order != this.selected_info.tactic_info.order)
						this.selected_info.tactic_info.order = 0;
					if (this.objects[cur_unit].tactic.pursuit != this.selected_info.tactic_info.pursuit)
						this.selected_info.tactic_info.pursuit = 0;
					if (this.objects[cur_unit].tactic.tolerance != this.selected_info.tactic_info.tolerance)
						this.selected_info.tactic_info.tolerance = 0;
					if (this.objects[cur_unit].tactic.independance != this.selected_info.tactic_info.independance)
						this.selected_info.tactic_info.independance = 0;
				}
			}
			
			this.selected_info.can_attack_ground = this.selected_info.can_attack_ground || this.objects[cur_unit].canAttackGround();
			this.selected_info.can_attack_fly = this.selected_info.can_attack_fly || this.objects[cur_unit].canAttackFly();
		}
		
		if (this.selected_objects.length > 0)
		{
			this.selected_info.harvesters = harvesters;
			this.selected_info.cyclones = cyclones;
			this.selected_info.humans = humans_only;
		}
			
		//Constructor selected?
		if (!skip_constructor)
		{
			if (this.selected_objects.length==1 && (this.objects[this.selected_objects[0]] instanceof ConstructionRigUnit))
				InterfaceConstructManager.drawBuildings();
			else
				InterfaceConstructManager.drawUnits();
		}
		
		InterfaceGUI.updateOrdersTab();
	};
	
	this._deselectUnits = function()
	{
		this._resetSelectionInfo();
		for (var i in this.selected_objects)
			this.objects[this.selected_objects[i]].select(false);
		this.selected_objects = [];
		
		InterfaceGUI.updateOrdersTab();
	};
	
	this._loadGameResources = function()
	{
		//Mouse
		MousePointer.loadResources();
		
		//Common resources
		this.resources.addImage('fogofwar', 'images/fog.png');
		this.resources.addSound('construction_under_way', 'sounds/construction_under_way.' + AUDIO_TYPE);
		this.resources.addSound('construction_complete', 'sounds/construction_complete.' + AUDIO_TYPE);
		this.resources.addSound('new_units_available', 'sounds/new_units_available.' + AUDIO_TYPE);
		this.resources.addSound('unit_completed', 'sounds/unit_completed.' + AUDIO_TYPE);
		this.resources.addSound('low_power', 'sounds/low_power.' + AUDIO_TYPE);
		this.resources.addSound('power_critical', 'sounds/power_critical.' + AUDIO_TYPE);
		this.resources.addSound('cant_build', 'sounds/cant_build.' + AUDIO_TYPE);
		this.resources.addSound('insufficient_credits', 'sounds/insufficient_credits.' + AUDIO_TYPE);
		this.resources.addSound('upgrade_available', 'sounds/upgrade_available.' + AUDIO_TYPE);
		this.resources.addSound('healing', 'sounds/healing.' + AUDIO_TYPE);
		this.resources.addSound('fixed', 'sounds/gxrepoc0.' + AUDIO_TYPE);
		this.resources.addSound('water_sell', 'sounds/gxcrdoc0.' + AUDIO_TYPE);
		this.resources.addSound('teleport', 'sounds/gxtgtoc0.' + AUDIO_TYPE);
		this.resources.addSound('unit_generation_in_progress', 'sounds/gvstscl3.' + AUDIO_TYPE);
		for (var i=0; i<10; ++i)
			this.resources.addSound('tactical_group' + ((i+1)%10), 'sounds/gvselcl' + i + '.' + AUDIO_TYPE);
		
		//Effects
		CraterEffect.loadResources();
		
		Animator.loadResources();
		WeaponHolder.loadResources();
	};
	
	this.unselectUnit = function(uid)
	{
		var index = this.selected_objects.indexOf(uid);
		if (index != -1)
		{
			this.objects[uid].select(false);
			this.selected_objects.splice(index, 1);
			
			this._resetSelectionInfo();
			this.rebuildSelectionInfo(true);
		}
	};
	
	this._resetSelectionInfo = function()
	{
		this.selected_info = {
			is_building: false,
			move_mode: 0,
			move_mode_min: MOVE_MODE_FLY,
			is_produce: false,
			can_attack_ground: false,
			can_attack_fly: false,
			humans: false,
			min_mass: 999,
			
			harvesters: false,
			cyclones: false,
			
			tactic_info: {
				order: 0,
				pursuit: 0,
				tolerance: 0,
				independance: 0
			}
		};
	};
	
	this.buildingUpgrade = function()
	{
		var upgraded = false;
		
		if (this.selected_info.is_building && this.objects[game.selected_objects[0]].isUpgradePossible())
		{
			var new_obj, old_obj = this.objects[game.selected_objects[0]], pos;
			
			if (this.players[PLAYER_HUMAN].haveEnoughMoney(old_obj._proto.upgrade_to.cost))
			{
				pos = old_obj.getCell();
				new_obj = new old_obj._proto.upgrade_to(pos.x, pos.y, old_obj.player);
			
				new_obj.uid = old_obj.uid;
				new_obj.health = old_obj.health;
				delete old_obj;
				this.objects[new_obj.uid] = new_obj;
				
				var time = (this.debug.quick_build) ? 2 : new_obj._proto.build_time;
				ActionsHeap.add(new_obj.uid, 'construct', {
					steps: time,
					current: 0,
					money: parseInt(new_obj._proto.cost / time),
					health: Math.ceil(new_obj._proto.health_max / time)
				});
				
				upgraded = true;
			}
		}
		
		if (!upgraded)
			game.resources.play('cant_build');
	};
	
	this.toggleActionState = function(state)
	{
		var prev_state = this.action_state;
		if (this.action_state != ACTION_STATE_NONE)
			this.cleanActionState();
		
		if (state == prev_state)
			return;
		
		switch (state)
		{
			case ACTION_STATE_SELL:
				$('#top_button_sell').addClass('active');
				break;
			case ACTION_STATE_POWER:
				$('#top_button_power').addClass('active');
				break;
			case ACTION_STATE_REPAIR:
				$('#top_button_repair').addClass('active');
				break;
			case ACTION_STATE_ATTACK:
				if (this.selected_objects.length == 0)
					return;
				$('#top_button_attack').addClass('active');
				break;
		}
		
		this.action_state = state;
	};
	
	this.cleanActionState = function()
	{
		switch (this.action_state)
		{
			case ACTION_STATE_SELL:
				$('#top_button_sell').removeClass('active');
				break;
			case ACTION_STATE_POWER:
				$('#top_button_power').removeClass('active');
				break;
			case ACTION_STATE_BUILD:
				InterfaceConstructManager.removeCellSelection();
				break;
			case ACTION_STATE_REPAIR:
				$('#top_button_repair').removeClass('active');
				break;
			case ACTION_STATE_ATTACK:
				$('#top_button_attack').removeClass('active');
				break;
		}
		
		this.action_state = ACTION_STATE_NONE;
	};
	
	this.addEffect = function(effect)
	{
		var uid = this.objects.length;
		effect.uid = uid;
		this.objects.push(effect);
		this.effects.push(uid);
		return uid;
	};
	
	this.deleteEffect = function(effectid)
	{
		//Remove user from effects array
		var sindex = this.effects.indexOf(effectid);
		if (sindex != -1)
			this.effects.splice(sindex, 1);
		
		this.kill_objects.push(effectid);
	};
	
	this.findCompatibleInstance = function(object_type_arr, player)
	{
		var i, j;
		
		for (i in this.objects)
			for (j in object_type_arr)
				if ((this.objects[i] instanceof object_type_arr[j]) && (this.objects[i].player==player))
					return this.objects[i];
		
		return null;
	};
	
	/**
	 * @param AbstractBuilding object_type
	 * @param int player Player ID
	 * @param int x
	 * @param int y
	 * @returns AbstractBuilding
	 */
	this.findNearestInstance = function(object_type, player, x, y)
	{
		var len = 99999, obj = null, i, tmp_path, cell;
		
		if (object_type.count[player] == 0)
			return null;
		
		for (i in this.objects)
		{
			if ((this.objects[i] instanceof object_type) && (this.objects[i].player == player))
			{
				cell = this.objects[i].getCell();
				if (cell.x==x && cell.y==y)
					return this.objects[i];
				
				tmp_path = PathFinder.findPath(x, y, cell.x, cell.y, MOVE_MODE_FLY, false);
				if ((tmp_path.length > 0) && (len > tmp_path.length))
				{
					len = tmp_path.length;
					obj = this.objects[i];
				}
			}
		}
		
		return obj;
	};
	
	this.togglePause = function()
	{
		this.paused = !this.paused;
		
		if (this.paused)
		{
			this.dialog.setOptions({
				text: 'game_paused',
				buttons: [{
					text: 'continue',
					callback: function(){
						game.togglePause();
					}
				}]
			});
			this.dialog.show();
		}
		else
		{
			this.dialog.hide();
		}
	};
	
	this.createTacticalGroup = function(id)
	{
		if (this.selected_objects.length == 0)
			return;
		
		var i, obj_id, fnd_indx;
		
		if ((this.tactical_groups[id] !== undefined) && (this.tactical_groups[id].length > 0))
		{
			for (i in this.tactical_groups[id])
			{
				obj_id = this.tactical_groups[id][i];
				if (this.objects[obj_id] === undefined)
					continue;
				this.objects[obj_id].tactic_group = -1;
			}
		}
		
		this.tactical_groups[id] = this.selected_objects;
		for (i in this.tactical_groups[id])
		{
			obj_id = this.tactical_groups[id][i];
			if (this.objects[obj_id].tactic_group != -1)
			{
				fnd_indx = this.tactical_groups[this.objects[obj_id].tactic_group].indexOf(obj_id);
				if (fnd_indx != -1)
					this.tactical_groups[this.objects[obj_id].tactic_group].splice(fnd_indx, 1);
			}
			this.objects[obj_id].tactic_group = id;
		}
	};
	
	this.selectTacticalGroup = function(id)
	{
		if (this.tactical_groups[id] === undefined)
			return;
		
		var i, obj_id, toselect = [];
		
		for (i in this.tactical_groups[id])
		{
			obj_id = this.tactical_groups[id][i];
			if (this.objects[obj_id] === undefined)
				continue;
			toselect.push(obj_id);
		}
		this.tactical_groups[id] = toselect;
		
		if (toselect.length > 0)
		{
			this._deselectUnits();
			for (i in toselect)
			{
				this.objects[toselect[i]].select(true, false);
				this.objects[toselect[i]].tactic_group = id;
				this.selected_objects.push(toselect[i]);
			}
			this.rebuildSelectionInfo();
			InterfaceSoundQueue.addIfEmpty('tactical_group' + id);
		}
	};
	
	this.changeGameParam = function(param, value)
	{
		switch (param)
		{
			case 'sound_volume':
				this.resources.setSoundVolume(value/100);
				break;
			case 'music_volume':
				InterfaceMusicPlayer.setVolume(value/100);
				break;
		}
	};
}

$(function(){
	var img = new Image();
	img.src = 'images/interface/load-screen.png';
	img.onload = function(){
		game = new Game();
		game.init(function(){
			game.draw();
			setInterval(function(){game.run();}, 1000/RUNS_PER_SECOND);
		});
		InterfaceGUI.setHandlers();
	};
});
