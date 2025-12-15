# Give admin rights to a player in the Minecraft server
docker exec kodecraft-minecraft rcon-cli op Mauri67

# Revoke admin rights from a player in the Minecraft server 
docker exec kodecraft-minecraft rcon-cli deop Mauri67

# Ban a player from the Minecraft server
docker exec kodecraft-minecraft rcon-cli ban Mauri67

# Unban a player from the Minecraft server
docker exec kodecraft-minecraft rcon-cli pardon Mauri67

# Kick a player from the Minecraft server
docker exec kodecraft-minecraft rcon-cli kick Mauri67 "You have been kicked from the server."

# Whitelist a player on the Minecraft server
docker exec kodecraft-minecraft rcon-cli whitelist add Mauri67
# Remove a player from the whitelist on the Minecraft server
docker exec kodecraft-minecraft rcon-cli whitelist remove Mauri67

# Locate the nearest village
docker exec kodecraft-minecraft rcon-cli locate structure minecraft:village_plains
# village_desert, village_savanna, village_taiga
docker exec kodecraft-minecraft rcon-cli locate structure minecraft:desert_pyramid
docker exec kodecraft-minecraft rcon-cli locate structure minecraft:jungle_pyramid
docker exec kodecraft-minecraft rcon-cli locate structure minecraft:swamp_hut
docker exec kodecraft-minecraft rcon-cli locate structure minecraft:ocean_monument
docker exec kodecraft-minecraft rcon-cli locate structure minecraft:mansion
docker exec kodecraft-minecraft rcon-cli locate structure minecraft:stronghold
docker exec kodecraft-minecraft rcon-cli locate structure minecraft:mineshaft
docker exec kodecraft-minecraft rcon-cli locate structure minecraft:pillager_outpost
docker exec kodecraft-minecraft rcon-cli locate structure minecraft:shipwreck
docker exec kodecraft-minecraft rcon-cli locate structure minecraft:ocean_ruins


# Summon an iron golem
docker exec kodecraft-minecraft rcon-cli summon iron_golem 224 65 64