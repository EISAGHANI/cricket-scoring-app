package com.cricket_scoring_app.repository;

import com.cricket_scoring_app.entity.Team;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;



@Repository
public interface TeamRepository extends JpaRepository <Team, Long>{
    
}
