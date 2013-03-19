function AbstractBuilding()
{
	this.uid = -1;
	this.player = 0;
	this.health = 0;
	this._proto = null;
	this.state = 'CONSTRUCTION';
	this.progress_bar = 0;

	this.is_effect = false;
	this.is_fly = false;
	this.is_building = true;
	this.is_selected = false;
	
	this.position = {x: 0, y: 0};
	
	//Building animation
	this._draw_last_frame_change = 0;
	this._draw_cur_frame = 0;
	
	//Repairing
	this._is_repairing = false;
	this._repairing_effect_id = 0;
	
	//Active part
	this._weapon_state = 0;
	
	this.init = function(pos_x, pos_y)
	{
		this.position = {
			x: (pos_x)*CELL_SIZE, 
			y: (pos_y)*CELL_SIZE
		};
	};
	
	this.applyFix = function(fix)
	{
		var aplly = Math.min(this._proto.health_max-this.health, fix);
		this.health += aplly;
		return aplly;
	};
	
	this.applyDamage = function(damage)
	{
		if (this.health <= 0)
			return; //Already destroyed
		
		this.health -= damage;
		
		if (this.health <= 0)
		{
			if (this._proto.crater > -1)
				CraterEffect.create(this);
			
			this._removingRecalc(this._proto);
			game.constructor.recalcUnitAvailability();
			this.onDestructed();
			
			game.kill_objects.push(this.uid);
		}
	};
	
	this.getCell = function()
	{
		return {x: Math.floor(this.position.x/CELL_SIZE), y: Math.floor(this.position.y/CELL_SIZE)};
	};
	
	this.drawSelection = function(is_onmouse)
	{
		this._drawSelectionStandart(is_onmouse);
	};
	
	this._drawSelectionStandart = function(is_onmouse)
	{
		var top_x = this.position.x - game.viewport_x,
			top_y = this.position.y + CELL_SIZE*this._proto.cell_size.y + 10  - game.viewport_y;
		
		if (this.player == PLAYER_NEUTRAL)
			game.viewport_ctx.strokeStyle = '#ffff00';
		else if (this.player == PLAYER_HUMAN)
			game.viewport_ctx.strokeStyle = (this.is_selected) ? '#ffffff' : '#393939';
		else
			game.viewport_ctx.strokeStyle = '#fc0800'; //Change it later to support aliances
		
		game.viewport_ctx.lineWidth = 1;
		
		game.viewport_ctx.beginPath();
		game.viewport_ctx.moveTo(top_x - 3, top_y - 8);
		game.viewport_ctx.lineTo(top_x, top_y + 0.5);
		game.viewport_ctx.lineTo(top_x + CELL_SIZE*this._proto.cell_size.x, top_y + 0.5);
		game.viewport_ctx.lineTo(top_x + CELL_SIZE*this._proto.cell_size.x + 3, top_y - 8);
		game.viewport_ctx.stroke();
		
		//Health
		var health_width = Math.round(CELL_SIZE*this._proto.cell_size.x*0.66);
		top_x += Math.round(health_width/4);
		game.viewport_ctx.fillStyle = '#000000';
		game.viewport_ctx.fillRect(top_x, top_y-2, health_width, 4);
		
		if (this.health < this._proto.health_max)
		{
			game.viewport_ctx.fillStyle = '#bbbbbb';
			game.viewport_ctx.fillRect(top_x + 1, top_y - 1, health_width - 2, 2);
		}

		var health_proc = this.health / this._proto.health_max;
		if (health_proc > 0.66)
			game.viewport_ctx.fillStyle = '#51FA00';
		else if (health_proc > 0.33)
			game.viewport_ctx.fillStyle = '#FCFC00';
		else
			game.viewport_ctx.fillStyle = '#FC0000';
		game.viewport_ctx.fillRect(top_x + 1, top_y - 1, (health_width - 2)*health_proc, 2);
		
		//Draw name
		top_y = this.position.y - this._proto.image_padding.y - 16.5 - game.viewport_y;
		top_x = this.position.x - 0.5 + health_width/4 - game.viewport_x;
		
		if (this.player == PLAYER_HUMAN)
		{
			if (this.state == 'CONSTRUCTION' || this.state == 'SELL' || this.state == 'UPGRADING')
			{
				var text = 'Under Construction';
				
				if (this.state == 'SELL')
					text = 'Demolishing';
				else if (this.state == 'UPGRADING')
					text = 'Upgrading';
					
				this._drawProgressBar(this.progress_bar, text);
				top_y -= 15;
			}

			if (this.state == 'PRODUCING')
			{
				var info = ProducingQueue.getProductionInfo(this.uid);
				this._drawProgressBar(info.progress, info.name);
				top_y -= 15;
			}
			
			if (this._proto.upgradable && this._proto.can_upgrade_now)
			{
				var up_top_y = this.position.y + CELL_SIZE*this._proto.cell_size.y - 8.5 - game.viewport_y;;
				game.fontDraw.drawOnCanvas(
					'Upgrade ' + this._proto.upgrade_to.cost + 'c', game.viewport_ctx, top_x, up_top_y, 
					'yellow', 'center', health_width
				);
			}
		}
		
		if (is_onmouse)
			game.fontDraw.drawOnCanvas(
				this._proto.obj_name, game.viewport_ctx, top_x, top_y, 
				'yellow', 'center', health_width
			);
	};
	
	this._drawProgressBar = function(proc, title)
	{
		var bar_width = Math.round(CELL_SIZE*this._proto.cell_size.x*0.66), 
			top_x = this.position.x - game.viewport_x + Math.round(bar_width/4),
			top_y = this.position.y - this._proto.image_padding.y - game.viewport_y;
			
		game.viewport_ctx.fillStyle = '#000000';
		game.viewport_ctx.fillRect(top_x, top_y-2, bar_width, 4);
		game.viewport_ctx.fillStyle = '#bbbbbb';
		game.viewport_ctx.fillRect(top_x + 1, top_y - 1, bar_width - 2, 2);
		game.viewport_ctx.fillStyle = '#FCFC00';
		game.viewport_ctx.fillRect(top_x + 1, top_y - 1, (bar_width - 2)*proc, 2);
		
		top_y = this.position.y - this._proto.image_padding.y - 16.5 - game.viewport_y;
		
		game.fontDraw.drawOnCanvas(
			title, game.viewport_ctx, top_x + 0.5, top_y, 
			'yellow', 'center', bar_width
		);
	};
	
	this.canBeSelected = function()
	{
		return true;
	};
	
	this.select = function(is_select, play_sound)
	{
		this.is_selected = is_select;
	};
	
	this.markCellsOnMap = function(userid)
	{
		var i = -1, x, y, cell = this.getCell(), cell_type = (userid==-1) ? CELL_TYPE_EMPTY : CELL_TYPE_BUILDING;
		for (x=0; x<this._proto.cell_size.x; ++x)
			for (y=0; y<this._proto.cell_size.y; ++y)
			{
				++i;
				if (this._proto.move_matrix[i] == 1)
					game.level.map_cells[cell.x+x][cell.y+y].type = cell_type;
				
				if (this._proto.cell_matrix[i] == 1)
					game.level.map_cells[cell.x+x][cell.y+y].building = userid;
				
			}
	};
	
	this.run = function() {};
	
	this.sell = function()
	{
		if (this.state != 'NORMAL')
			return;
		
		this.state = 'SELL';
		var time = (game.debug.quick_build) ? 2 : this._proto.sell_time;
		ActionsHeap.add(this.uid, 'sell', {
			steps: time,
			current: 0
		});
	};
	
	this.repair = function()
	{
		if (this._is_repairing)
		{
			this._is_repairing = false;
			ActionsHeap.remove(this.uid, 'repair');
			game.deleteEffect(this._repairing_effect_id);
		}
		else
		{
			if (this.state == 'CONSTRUCTION')
				return;
			
			if (this.health >= this._proto.health_max)
				return;
			
			this._is_repairing = true;
			ActionsHeap.add(this.uid, 'repair', 0);
			
			effect = new RepriconEffect({
				x: this.position.x + CELL_SIZE*this._proto.cell_padding.x,
				y: this.position.y + CELL_SIZE*this._proto.cell_padding.y
			});
			var uid = game.addEffect(effect);
			effect.uid = uid;
			this._repairing_effect_id = uid;
			console.log('Effect added: ' + uid);
		}
	};
	
	this.draw = function(cur_time)
	{
		if (this.state == 'CONSTRUCTION' || this.state == 'UPGRADING')
		{
			if (this._proto.shadow_image_size !== null)
				this._drawShadow(0, 0);
			this._drawSprite(DRAW_LAYER_GBUILD, 0, 0);
			this._drawSprite(DRAW_LAYER_TBUILD, 1, 0);
		}
		else
		{
			if ((this.health / this._proto.health_max) < 0.33)
			{
				if (this._proto.shadow_image_size !== null)
					this._drawShadow(0, 2);
				this._drawSprite(DRAW_LAYER_GBUILD, 0, 2);
				this._drawSprite(DRAW_LAYER_TBUILD, 1, 2);
			}
			else
			{
				if (this._proto.shadow_image_size !== null)
					this._drawShadow(0, 1);
				this._drawSprite(DRAW_LAYER_GBUILD, 0, 1);

				if (this._proto.image_animated)
				{
					this._drawSprite(DRAW_LAYER_TBUILD, this._proto.image_animation_frames[this._draw_cur_frame], 1);

					if ((cur_time - this._draw_last_frame_change)>200)
					{
						++this._draw_cur_frame;
						this._draw_cur_frame %= this._proto.image_animation_frames.length;
						this._draw_last_frame_change = cur_time;
					}
				}
				else
					this._drawSprite(DRAW_LAYER_TBUILD, 1, 1);
			}
			
			if (this._proto.weapon !== null)
			{
				this._weapon_state += 0.1; //@todo Remove later. Added just for animation testing
				game.objDraw.addElement(DRAW_LAYER_ABUILD, this.position.x, {
					res_key: this._proto.res_key + '_weapon', 
					src_x: this._proto.weapon_image_size.x * (parseInt(this._weapon_state) % 16), //@todo Remove later. Added just for animation testing
					src_y: 0,
					src_width: this._proto.weapon_image_size.x,
					src_height: this._proto.weapon_image_size.y,
					x: this.position.x - this._proto.weapon_image_padding.x - game.viewport_x,
					y: this.position.y - this._proto.weapon_image_padding.y - game.viewport_y
				});
			}
		}
	};
	
	this._drawSprite = function(layer, frame_x, frame_y)
	{
		game.objDraw.addElement(layer, this.position.x, {
			res_key: this._proto.res_key, 
			src_x: this._proto.image_size.x * frame_x,
			src_y: this._proto.image_size.y * frame_y,
			src_width: this._proto.image_size.x,
			src_height: this._proto.image_size.y,
			x: this.position.x - this._proto.image_padding.x - game.viewport_x,
			y: this.position.y - this._proto.image_padding.y - game.viewport_y
		});
	};
	
	this._drawShadow = function(frame_x, frame_y)
	{
		game.objDraw.addElement(DRAW_LAYER_SHADOWS, this.position.x, {
			res_key: this._proto.res_key + '_shadow',
			src_x: this._proto.shadow_image_size.x * frame_x,
			src_y: this._proto.shadow_image_size.y * frame_y,
			src_width: this._proto.shadow_image_size.x,
			src_height: this._proto.shadow_image_size.y,
			x: this.position.x - this._proto.shadow_image_padding.x - game.viewport_x,
			y: this.position.y - this._proto.shadow_image_padding.y - game.viewport_y
		});
	};
	
	this.canAttackFly = function()
	{
		return false; //Change it later because Guard Towers can attack
	};
	
	this.canAttackGround = function()
	{
		return false; //Change it later because Guard Towers can attack
	};
	
	this.orderAttack = function(target) {};
	
	this._removingRecalc = function(obj_proto)
	{
		obj_proto.count--;
		game.players[this.player].energyAddCurrent(-1*obj_proto.energy);
		
		if (obj_proto.upgrade_from !== null)
			this._removingRecalc(obj_proto.upgrade_from);
	};
	
	this.produce = function(obj)
	{
		var cell = this.getCell(), unit = AbstractUnit.createNew(obj, cell.x + 2, cell.y + 2, this.player); //@todo: change position?
		cell = PathFinder.findNearestEmptyCell(cell.x, cell.y + 5, !unit.is_fly);
		unit.orderMove(cell);
	};
	
	this.isUpgradePossible = function()
	{
		return (this._proto.upgradable && this._proto.can_upgrade_now && this.state=='NORMAL');
	};
	
	this.isHuman = function()
	{
		return false;
	};
	
	this.canHarvest = function()
	{
		return false;
	};
	
	this.isHarvestPlatform = function()
	{
		return false;
	};
	
	//Functions for resource containing buildings
	//Need to move it to another abstract object
	
	this.isResFull = function()
	{
		return (this.res_now >= this.res_max);
	};
	
	this.decreaseRes = function(amount)
	{
		if (this.res_now < amount)
			amount = this.res_now;
		
		this.res_now -= amount;
		return amount;
	};
	
	this.increaseRes = function(amount)
	{
		return this._standardIncreaseRes(amount);
	};
	
	this._standardIncreaseRes = function(amount)
	{
		if ((this.res_now+amount) > this.res_max)
			amount = this.res_max - this.res_now;
		
		this.res_now += amount;
		return amount;
	};
	
	//Event functions
	
	this.onObjectDeletion = function() 
	{
		this.markCellsOnMap(-1);
	};
	
	this.onConstructed = function() 
	{
		this._proto.count++;
			
		if (this.state == 'CONSTRUCTION')
			game.notifications.addSound('construction_complete');
		if (this.state == 'UPGRADING')
			this.health = this._proto.health_max;
		
		game.constructor.recalcUnitAvailability();

		game.players[this.player].energyAddCurrent(this._proto.energy);
		this.state = 'NORMAL';

		if (this._proto.is_built_from_edge)
		{
			var cell = this.getCell(), pos = PathFinder.findNearestStandCell(cell.x, cell.y);
			AbstractUnit.createNew(ConstructionRigUnit, pos.x, pos.y, this.player, true);
		}

		this.onConstructedCustom();
	};
	
	this.onSold = function() 
	{
		var cell = this.getCell();
			
		this._removingRecalc(this._proto);
		game.constructor.recalcUnitAvailability();

		game.players[this.player].addMoney(this._proto.sell_cost);

		if (!this._proto.is_built_from_edge)
		{
			var pos = PathFinder.findNearestStandCell(cell.x + 2, cell.y + 2);
			AbstractUnit.createNew(ConstructionRigUnit, pos.x, pos.y, this.player, true);
		}

		this.onDestructed();

		game.kill_objects.push(this.uid);
	};
	
	this.onDestructed = function() {};
	this.onConstructedCustom = function() {};
}

//Static methods
AbstractBuilding.drawBuildMouse = function(obj, x, y)
{
	if (obj.is_bridge)
	{
		BridgeTypeBuilding.drawBuildMouse(obj, x, y);
		return;
	}
		
	var i = -1;
	
	game.viewport_ctx.drawImage(
		game.resources.get(obj.res_key), 0, obj.image_size.y, 
		obj.image_size.x, obj.image_size.y, 
		x*CELL_SIZE - game.viewport_x - obj.image_padding.x, 
		y*CELL_SIZE - game.viewport_y - obj.image_padding.y, 
		obj.image_size.x, obj.image_size.y
	);
	game.viewport_ctx.drawImage(
		game.resources.get(obj.res_key), obj.image_size.x, obj.image_size.y, 
		obj.image_size.x, obj.image_size.y, 
		x*CELL_SIZE - game.viewport_x - obj.image_padding.x, 
		y*CELL_SIZE - game.viewport_y - obj.image_padding.y, 
		obj.image_size.x, obj.image_size.y
	);
		
	for (var xx = 0; xx<obj.cell_size.x; ++xx)
	{
		var xxx = xx+x;
		if (!MapCell.isCorrectX(xxx))
			continue;
		
		for (var yy = 0; yy<obj.cell_size.y; ++yy)
		{
			++i;
			if (obj.cell_matrix[i] == 0)
				continue;
			
			var yyy = yy+y;
			if (!MapCell.isCorrectY(yyy))
				continue;
			
			var cell = game.level.map_cells[xxx][yyy], unitid = MapCell.getSingleUserId(cell);
			if (cell.type!=0 || (unitid!=-1 && unitid!=game.action_state_options.requested_unit))
			{
				game.viewport_ctx.drawImage(
					game.resources.get('clr'), 0, 0, CELL_SIZE, CELL_SIZE, 
					xxx*CELL_SIZE - game.viewport_x, yyy*CELL_SIZE - game.viewport_y, CELL_SIZE, CELL_SIZE
				);
			}
		}
	}
};

AbstractBuilding.createNew = function(obj, x, y, player, instant_build)
{
	var uid = game.objects.length, new_obj;
	game.objects.push(new obj(x, y, player));
	new_obj = game.objects[uid];
	new_obj.uid = uid;
	new_obj.markCellsOnMap(uid);
	
	if (instant_build)
	{
		new_obj.state = 'NORMAL';
		new_obj.health = obj.health_max;
	}
	else
	{
		game.notifications.addSound('construction_under_way');
		var time = (game.debug.quick_build) ? 2 : obj.build_time;
		ActionsHeap.add(uid, 'construct', {
			steps: time,
			current: 0,
			money: parseInt(obj.cost / time),
			health: Math.ceil(obj.health_max / time)
		});
	}
};

AbstractBuilding.canBuild = function(obj, x, y, unit)
{
	if (!game.players[PLAYER_HUMAN].haveEnoughMoney(obj.cost))
		return false;
	
	if (!obj.enabled)
		return false;
	
	if (obj.is_bridge)
		return BridgeTypeBuilding.canBuild(obj, x, y, unit);
	
	var i = -1;
	
	for (var xx = 0; xx<obj.cell_size.x; ++xx)
	{
		var xxx = xx+x;
		
		if (!MapCell.isCorrectX(xxx))
			return false;
		
		for (var yy = 0; yy<obj.cell_size.y; ++yy)
		{
			++i;
			if (obj.cell_matrix[i] == 0)
				continue;
			
			var yyy = yy+y;
			if (!MapCell.isCorrectX(yyy))
				return false;
			
			var cell = game.level.map_cells[xxx][yyy], unitid = MapCell.getSingleUserId(cell);
			if (cell.type!=CELL_TYPE_EMPTY || (unitid!=-1 && unitid!=unit))
				return false;
		}
	}
	
	return true;
};

AbstractBuilding.loadResources = function(obj)
{
	game.resources.addImage(obj.res_key, 'images/buildings/'+obj.res_key+'/sprite.png');
	
	if (typeof obj.require_building == 'undefined')
		game.resources.addImage(obj.res_key + '_box', 'images/buildings/'+obj.res_key+'/box.png');
	
	if (obj.shadow_image_size !== null)
		game.resources.addImage(obj.res_key + '_shadow', 'images/buildings/'+obj.res_key+'/shadow.png');
	
	if (obj.weapon !== null)
		game.resources.addImage(obj.res_key + '_weapon', 'images/buildings/'+obj.res_key+'/weapon.png');
};

AbstractBuilding.getById = function(obj_id)
{
	if (game.objects[obj_id] === undefined)
		return null;
		
	if (!game.objects[obj_id].is_building)
		return null;
	
	return game.objects[obj_id];
};

AbstractBuilding.isExists = function(obj_id)
{
	return (AbstractBuilding.getById(obj_id) !== null);
};

AbstractBuilding.canSelectedProduce = function(obj)
{
	if (game.selected_info.is_building)
		return (obj.construction_building.indexOf(game.objects[game.selected_objects[0]]._proto) != -1);

	return true;
};

AbstractBuilding.setBuildingCommonOptions = function(obj)
{
	obj.prototype = new AbstractBuilding();
	
	obj.res_key = '';  //Must redeclare
	obj.obj_name = ''; //Must redeclare
	obj.cost = 0;
	obj.build_time = 0; //config_speed / 1.5
	obj.sell_cost = 0;
	obj.sell_time = 0;  //config_speed / 1.5
	obj.health_max = 100;
	obj.energy = 0;
	obj.enabled = false;
	obj.can_build = false;
	obj.count = 0;
	obj.is_bridge = false;
	obj.shield_type = 'BuildingArmour';
	obj.crater = -1;
	obj.is_built_from_edge = false;
	obj.weapon = null;

	obj.cell_size = null;       //Must redeclare
	obj.cell_matrix = null;     //Must redeclare
	obj.move_matrix = null;     //Must redeclare
	obj.cell_padding = null;    //Must redeclare
	obj.image_size = null;      //Must redeclare
	obj.image_padding = null;
	obj.image_animated = false;
	obj.image_animation_frames = null;
	obj.shadow_image_size = null;
	obj.shadow_image_padding = null;
	obj.weapon_image_size = null;
	obj.weapon_image_padding = null;
	obj.require_building = [];

	obj.upgradable = false;
	obj.upgrade_from = null;
	obj.can_upgrade_now = false;
	obj.upgrade_to = null;
	
	obj.loadResources = function(){
		AbstractBuilding.loadResources(this);
	};
};